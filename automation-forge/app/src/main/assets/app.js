'use strict';

/* Automation Forge v3.1
 * Safe local workflow runner + Android-oriented browser toolbox.
 * No eval(), dynamic code loading, external libraries, or implicit uploads.
 */
const DB_NAME='automation-forge-v3';
const DB_VERSION=1;
const STORE='records';
const OUTBOX='outbox';
const APP_KEY='workspace';
const LEGACY_KEY='automation_forge_android_v1';
const MAX_HASH_BYTES=64*1024*1024;
const MAX_ZIP_BYTES=80*1024*1024;
const CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0;});
let db=null;
let state=null;
let storageMode='initializing';
let storageWarningShown=false;
let engine={running:false,paused:false,stop:false,runId:0,currentRun:null};
let selectedFiles=[];
let deferredInstall=null;
let bridgeTokenSession='';
let backupObjectUrl=null;
let toastTimer=null;

const $=(id)=>document.getElementById(id);
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const uid=()=>window.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,10);
const clone=(v)=>JSON.parse(JSON.stringify(v));
const esc=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmtBytes=(n)=>{if(!Number.isFinite(n))return '—';if(n<1024)return n+' B';const units=['KB','MB','GB','TB'];let i=-1;do{n/=1024;i++;}while(n>=1024&&i<units.length-1);return n.toFixed(n>=10?1:2)+' '+units[i]};
const fmtDate=(v)=>{try{return new Date(v).toLocaleString()}catch{return String(v||'')}};

function starterState(){
  return {
    version:3,updatedAt:new Date().toISOString(),
    tasks:[
      {id:uid(),title:'Map one repetitive task into a safe workflow',project:'Forge launch',note:'Identify trigger, inputs, decision points, exception cases and approval boundaries.',done:false,createdAt:new Date().toISOString()},
      {id:uid(),title:'Test the toolbox with a small file batch',project:'Forge launch',note:'Try file intake, SHA-256 and ZIP packaging before using large batches.',done:false,createdAt:new Date().toISOString()}
    ],
    flows:[
      {id:uid(),title:'Project kickoff pipeline',description:'A repeatable project setup with explicit checkpoints.',steps:['NOTE: Start project kickoff','CHECK: Confirm the outcome and constraints','TASK: Define Android-first acceptance tests','TASK: Identify local automation opportunities','TASK: Evaluate useful skills and connections','CHECK: Review privacy, permissions and external dependencies','NOTE: Build, test, package and document'],checked:[],createdAt:new Date().toISOString()},
      {id:uid(),title:'Media intake & audit',description:'Inspect a user-selected file batch without changing originals.',steps:['CHECK: Confirm the selected source files','NOTE: Review names, types and sizes in the file intake panel','DUPLICATES:SCAN','TASK: Review duplicate candidates','CHECK: Approve any manual follow-up before changing source files','BACKUP:PREPARE'],checked:[],createdAt:new Date().toISOString()}
    ],
    tools:[
      {id:uid(),name:'IndexedDB workspace',kind:'Built-in storage',status:'Available',notes:'Local structured storage for tasks, workflows, runs and file metadata.'},
      {id:uid(),name:'Web Crypto SHA-256',kind:'Built-in API',status:'Feature detected',notes:'Used for file/text checksums when secure-context support is available.'},
      {id:uid(),name:'Optional webhook bridge',kind:'Network connector',status:'Not configured',notes:'Manual opt-in POST only. Bearer tokens are not saved.'},
      {id:uid(),name:'Todoist',kind:'Optional ChatGPT connection',status:'Not connected',notes:'Can extend task, project and reminder workflows through a separate ChatGPT connection. Not directly wired into this standalone app.'},
      {id:uid(),name:'Box',kind:'Optional ChatGPT connection',status:'Not connected',notes:'Can extend cloud-file search and collaboration through a separate ChatGPT connection. Not directly wired into this standalone app.'}
    ],
    discovery:[
      {label:'Prefer browser-native functionality before adding dependencies',done:true},
      {label:'Verify Android browser support and provide a fallback',done:true},
      {label:'Keep core file and text processing local',done:true},
      {label:'Require confirmation for network sends and destructive operations',done:true},
      {label:'Review relevant skills, plugins and connectors when a task needs them',done:false},
      {label:'Document offline and background execution limits',done:true}
    ],
    webhooks:[],fileRecords:[],runs:[],settings:{},
  };
}

function openDatabase(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window))return reject(new Error('IndexedDB is unavailable'));
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const d=request.result;
      if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'});
      if(!d.objectStoreNames.contains(OUTBOX))d.createObjectStore(OUTBOX,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Could not open local database'));
  });
}
function dbGet(store,key){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function dbPut(store,value){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Database write aborted'));});}
function dbDelete(store,key){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);});}
function dbAll(store){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});}

function normaliseState(input){
  const base=starterState();
  if(!input||typeof input!=='object')return base;
  const arrays=['tasks','flows','tools','discovery','webhooks','fileRecords','runs'];
  for(const k of arrays)if(Array.isArray(input[k]))base[k]=input[k];
  if(input.settings&&typeof input.settings==='object')base.settings=input.settings;
  base.version=3;base.updatedAt=input.updatedAt||new Date().toISOString();
  base.tasks=base.tasks.filter(x=>x&&typeof x==='object').map(x=>({...x,id:String(x.id||uid()),done:!!x.done,createdAt:x.createdAt||new Date().toISOString()}));
  base.flows=base.flows.filter(x=>x&&typeof x==='object').map(x=>({...x,id:String(x.id||uid()),steps:Array.isArray(x.steps)?x.steps.map(String):[],checked:Array.isArray(x.checked)?x.checked:[]}));
  return base;
}
async function persist(){
  if(!state)return;
  state.updatedAt=new Date().toISOString();
  try{
    if(db){await dbPut(STORE,{id:APP_KEY,data:state});storageMode='indexedDB';}
    else{localStorage.setItem('automation_forge_v3_fallback',JSON.stringify(state));storageMode='localStorage';}
  }catch(error){
    console.warn('Forge persistence:',error);db=null;
    try{localStorage.setItem('automation_forge_v3_fallback',JSON.stringify(state));storageMode='localStorage';if(!storageWarningShown){toast('IndexedDB unavailable. Saved using browser storage instead.');storageWarningShown=true;}}
    catch(fallbackError){storageMode='memory';if(!storageWarningShown){toast('Temporary session only. Export a backup before closing this tab.');storageWarningShown=true;}console.warn('Forge memory-only mode:',fallbackError);}
  }
  const stamp=$('lastSaved');if(stamp)stamp.textContent=storageMode==='memory'?'Session only · export backup':'Saved '+new Date(state.updatedAt).toLocaleTimeString();
}
async function loadState(){
  try{db=await openDatabase();const stored=await dbGet(STORE,APP_KEY);storageMode='indexedDB';if(stored&&stored.data)return normaliseState(stored.data);}
  catch(error){db=null;console.warn('IndexedDB fallback:',error);}
  try{
    const fallback=localStorage.getItem('automation_forge_v3_fallback');if(fallback){storageMode='localStorage';return normaliseState(JSON.parse(fallback));}
    const legacy=localStorage.getItem(LEGACY_KEY);if(legacy){storageMode='localStorage';const old=JSON.parse(legacy);const migrated=normaliseState(old);migrated.runs.unshift({id:uid(),title:'Legacy workspace migration',status:'success',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),logs:['Imported tasks, workflows, tools and discovery checklist from Automation Forge v1/v2 browser storage.']});return migrated;}
    storageMode='localStorage';
  }catch(error){storageMode='memory';console.warn('Browser storage unavailable:',error);}
  return starterState();
}

function toast(message){const node=$('toast');node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),2600);}
function go(view){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id==='view-'+view));document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));window.scrollTo({top:0,behavior:'smooth'});if(view==='engine')renderEngine();if(view==='settings')renderStorage();}
function logActivity(message){if(!state)return;state.runs.unshift({id:uid(),title:'Activity',status:'info',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),logs:[message]});state.runs=state.runs.slice(0,40);persist();}

function openDialog(kind,id=null){
  const dlg=$('forgeDialog'),body=$('dialogBody');let title='Create';let html='';
  if(kind==='task'){
    const task=id?state.tasks.find(x=>x.id===id):null;title=task?'Edit task':'New task';
    html=`<div><label for="dTitle">Task name</label><input id="dTitle" maxlength="180" value="${esc(task?.title||'')}" placeholder="What needs doing?"></div><div><label for="dProject">Project / group</label><input id="dProject" maxlength="100" value="${esc(task?.project||'')}" placeholder="Optional"></div><div><label for="dNote">Notes</label><textarea id="dNote" placeholder="Context, constraints or next action…">${esc(task?.note||'')}</textarea></div>`;
    $('dialogSave').onclick=()=>{const name=$('dTitle').value.trim();if(!name)return toast('Enter a task name.');if(task){task.title=name;task.project=$('dProject').value.trim();task.note=$('dNote').value.trim();}else state.tasks.unshift({id:uid(),title:name,project:$('dProject').value.trim(),note:$('dNote').value.trim(),done:false,createdAt:new Date().toISOString()});persist();renderAll();dlg.close();toast(task?'Task updated':'Task added');};
  }else if(kind==='flow'){
    const flow=id?state.flows.find(x=>x.id===id):null;title=flow?'Edit workflow':'New workflow';
    html=`<div><label for="dTitle">Workflow name</label><input id="dTitle" maxlength="120" value="${esc(flow?.title||'')}" placeholder="e.g. Weekly media audit"></div><div><label for="dNote">Description</label><textarea id="dNote" placeholder="What outcome should this flow deliver?">${esc(flow?.description||'')}</textarea></div><div><label for="dSteps">Steps, one per line</label><textarea id="dSteps" style="min-height:180px;font-family:ui-monospace,monospace" placeholder="NOTE: Start the workflow\nCHECK: Confirm inputs\nTASK: Process the batch">${esc((flow?.steps||[]).join('\n'))}</textarea></div><p class="tool-note">Commands supported: TASK, NOTE, WAIT, CHECK, COPY, DUPLICATES:SCAN, JSON:VALIDATE, CSV:CONVERT, BACKUP:PREPARE. Plain text is recorded as a checkpoint.</p>`;
    $('dialogSave').onclick=()=>{const name=$('dTitle').value.trim(),steps=$('dSteps').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!name||!steps.length)return toast('Add a workflow name and at least one step.');if(flow){flow.title=name;flow.description=$('dNote').value.trim();flow.steps=steps;flow.checked=[];}else state.flows.unshift({id:uid(),title:name,description:$('dNote').value.trim(),steps,checked:[],createdAt:new Date().toISOString()});persist();renderAll();dlg.close();toast(flow?'Workflow updated':'Workflow created');};
  }else if(kind==='tool'){
    title='Add capability to inventory';html=`<div><label for="dTitle">Name</label><input id="dTitle" placeholder="Tool, skill, connector or API"></div><div><label for="dProject">Type</label><select id="dProject"><option>Skill</option><option>Plugin / connector</option><option>Android app</option><option>API / webhook</option><option>Local utility</option><option>Library / framework</option></select></div><div><label for="dNote">Status and notes</label><textarea id="dNote" placeholder="Availability, value, permissions, setup…"></textarea></div>`;
    $('dialogSave').onclick=()=>{const name=$('dTitle').value.trim();if(!name)return toast('Enter a capability name.');state.tools.unshift({id:uid(),name,kind:$('dProject').value,status:'Research / pending',notes:$('dNote').value.trim()});persist();renderConnections();dlg.close();toast('Capability added');};
  }
  $('dialogEyebrow').textContent=kind==='task'?'TASK CAPTURE':kind==='flow'?'WORKFLOW BUILDER':'CAPABILITY INVENTORY';$('dialogTitle').textContent=title;body.innerHTML=html;dlg.showModal();setTimeout(()=>body.querySelector('input,textarea')?.focus(),60);
}

function renderHome(){
  const open=state.tasks.filter(t=>!t.done);$('metricTasks').textContent=open.length;$('metricFlows').textContent=state.flows.length;$('metricFiles').textContent=state.fileRecords.length;
  const completed=state.runs.filter(r=>r.status==='success').length;const finished=state.runs.filter(r=>['success','failed','stopped'].includes(r.status)).length;$('metricRuns').textContent=finished?Math.round(completed/finished*100)+'%':'—';
  const tasks=open.slice(0,5);$('homeTasks').innerHTML=tasks.length?tasks.map(taskMarkup).join(''):'<div class="empty-state">Nothing urgent in the queue. Add a task or load a starter workflow.</div>';
  $('homeFlows').innerHTML=state.flows.slice(0,3).map(f=>`<div class="task-item"><div class="task-copy"><div class="task-title">${esc(f.title)}</div><div class="task-meta">${f.steps.length} steps · ${f.steps.filter(x=>/^(TASK|CHECK|WAIT|COPY|NOTE|DUPLICATES|JSON|CSV|BACKUP|ANDROID):/.test(x)).length} executable actions</div></div><button class="mini-action" data-action="launch-flow" data-id="${esc(f.id)}" aria-label="Launch">↗</button></div>`).join('')||'<div class="empty-state">No playbooks yet.</div>';
  renderCapabilities();
}
function taskMarkup(task){return `<div class="task-item ${task.done?'done':''}"><button class="task-check" data-action="toggle-task" data-id="${esc(task.id)}" aria-label="Toggle task">${task.done?'✓':''}</button><div class="task-copy"><div class="task-title">${esc(task.title)}</div><div class="task-meta">${esc(task.project||'Unsorted')}${task.note?' · '+esc(task.note):''}</div></div><button class="mini-action" data-action="edit-task" data-id="${esc(task.id)}" aria-label="Edit task">✎</button><button class="mini-action" data-action="delete-task" data-id="${esc(task.id)}" aria-label="Delete task">×</button></div>`;}
function renderTasks(){
  const search=($('taskSearch')?.value||'').toLowerCase();const filter=$('taskFilter')?.value||'open';const items=state.tasks.filter(t=>(filter==='all'||(filter==='done'?t.done:!t.done))&&(`${t.title} ${t.project||''} ${t.note||''}`).toLowerCase().includes(search));
  $('taskList').innerHTML=items.length?items.map(taskMarkup).join(''):'<div class="empty-state">No matching tasks. Try another filter or create a task.</div>';
}
function renderFlows(){
  $('flowList').innerHTML=state.flows.length?state.flows.map(f=>`<article class="flow-card"><h3>${esc(f.title)}</h3><p>${esc(f.description||'Reusable workflow')}</p><div class="flow-meta"><span class="tag">${f.steps.length} STEPS</span><span class="tag tag-live">${f.steps.filter(s=>/^(TASK|NOTE|WAIT|CHECK|COPY|DUPLICATES|JSON|CSV|BACKUP|ANDROID):/.test(s)).length} ACTIONS</span></div><div class="task-meta">${f.steps.slice(0,3).map(esc).join(' · ')}${f.steps.length>3?' …':''}</div><div class="flow-actions"><button class="button button-primary" data-action="launch-flow" data-id="${esc(f.id)}">▶ Run</button><button class="button button-secondary" data-action="edit-flow" data-id="${esc(f.id)}">Edit</button><button class="button button-danger" data-action="delete-flow" data-id="${esc(f.id)}">Delete</button></div></article>`).join(''):'<div class="empty-state">No workflows created yet.</div>';
  renderRecipes();
}
const RECIPES=[
  {name:'Project kickoff',description:'A clean sequence for starting a new build.',steps:['NOTE: Begin project kickoff','CHECK: Confirm the goal, audience and device','TASK: Write acceptance criteria','TASK: Map repeatable actions','TASK: Identify reusable skills and integrations','CHECK: Verify permission and privacy boundaries','NOTE: Package and document the result']},
  {name:'Media intake audit',description:'Review a file batch without altering originals.',steps:['CHECK: Confirm the selected media batch','NOTE: Review the indexed file list','DUPLICATES:SCAN','TASK: Inspect exact duplicate groups','CHECK: Approve any proposed manual cleanup','BACKUP:PREPARE']},
  {name:'Data cleanup',description:'Validate JSON and convert CSV into structured data.',steps:['CHECK: Paste the source data into the JSON / CSV workbench','JSON:VALIDATE','CSV:CONVERT','NOTE: Review the generated output','BACKUP:PREPARE']},
  {name:'Release checklist',description:'Package and verify a mobile deliverable.',steps:['TASK: Check Android viewport and touch targets','TASK: Verify offline launch behaviour','TASK: Run workflow test cases','CHECK: Approve the release candidate','BACKUP:PREPARE','NOTE: Record release verification']}
];
function renderRecipes(){$('recipeList').innerHTML=RECIPES.map((r,i)=>`<article class="recipe-card"><h3>${esc(r.name)}</h3><p>${esc(r.description)}</p><div class="flow-meta"><span class="tag">${r.steps.length} STEPS</span><span class="tag">STARTER</span></div><button class="button button-secondary top-gap" data-action="load-recipe" data-index="${i}">＋ Add to workflows</button></article>`).join('');}
function loadRecipe(index){const r=RECIPES[index];if(!r)return;state.flows.unshift({id:uid(),title:r.name,description:r.description,steps:[...r.steps],checked:[],createdAt:new Date().toISOString()});persist();renderAll();toast(r.name+' added to workflows');}

function renderEngine(){
  const sel=$('engineFlow');if(!sel)return;const previous=sel.value;sel.innerHTML=state.flows.map(f=>`<option value="${esc(f.id)}">${esc(f.title)}</option>`).join('');if(state.flows.some(f=>f.id===previous))sel.value=previous;
  const chosen=state.flows.find(f=>f.id===sel.value);$('engineFlowName').textContent=chosen?chosen.title:'Create a workflow first';
  const progress=engine.currentRun?.progress||0;$('engineState').textContent=engine.running?(engine.paused?'PAUSED':'RUNNING'):'IDLE';$('engineBar').style.width=progress+'%';$('engineProgressPct').textContent=progress+'%';$('engineProgressText').textContent=engine.currentRun?.message||'Ready when you are';
  $('runLog').innerHTML=state.runs.slice(0,12).map(r=>`<div class="run-row"><div class="run-head"><b>${esc(r.title||'Workflow run')}</b><span class="run-status ${r.status==='failed'?'failed':r.status==='stopped'?'stopped':''}">${esc(String(r.status||'info').toUpperCase())}</span></div><div class="run-detail">${esc(fmtDate(r.startedAt))} · ${(r.logs||[]).length} log entries${r.finishedAt?' · Finished '+esc(fmtDate(r.finishedAt)):''}</div>${(r.logs||[]).slice(-3).map(line=>`<div class="task-meta">${esc(line)}</div>`).join('')}</div>`).join('')||'<div class="empty-state">No execution history yet.</div>';
  $('commandGrid').innerHTML=[['TASK:','Create a local task'],['NOTE:','Write a message to the run log'],['WAIT:','Wait 0–300 seconds'],['CHECK:','Pause for an approval decision'],['COPY:','Copy text to the clipboard'],['DUPLICATES:SCAN','Report exact SHA-256 duplicate groups'],['JSON:VALIDATE','Validate JSON in the workbench'],['CSV:CONVERT','Convert CSV input to JSON'],['BACKUP:PREPARE','Prepare a JSON backup download'],['ANDROID:TOAST: text','Call the local Termux bridge after approval'],['ANDROID:NOTIFY: title|text','Post a device notification after approval'],['ANDROID:SPEAK: text','Use Android text-to-speech after approval'],['ANDROID:VIBRATE: ms','Request a short vibration after approval'],['ANDROID:BATTERY','Read battery status through Termux:API']].map(x=>`<div class="command-card"><code>${esc(x[0])}</code><p>${esc(x[1])}</p></div>`).join('');
}
function engineLog(run,message){run.logs.push(new Date().toLocaleTimeString()+' · '+message);if(run.logs.length>80)run.logs.shift();engine.currentRun=run;}
async function waitForEngine(ms,runId){const end=Date.now()+ms;while(Date.now()<end){if(engine.stop||engine.runId!==runId)return false;while(engine.paused&&!engine.stop&&engine.runId===runId){await sleep(150);}if(engine.stop||engine.runId!==runId)return false;await sleep(Math.min(180,end-Date.now()));}return true;}
function exactDuplicateGroups(){const map=new Map();for(const f of state.fileRecords){if(!f.sha256)continue;if(!map.has(f.sha256))map.set(f.sha256,[]);map.get(f.sha256).push(f);}return [...map.values()].filter(group=>group.length>1);}
async function engineRun(){
  if(engine.running)return toast('The engine is already running.');const flow=state.flows.find(f=>f.id===$('engineFlow').value);if(!flow)return toast('Create or select a workflow first.');
  engine.running=true;engine.paused=false;engine.stop=false;const runId=++engine.runId;const run={id:uid(),title:flow.title,status:'running',startedAt:new Date().toISOString(),logs:[],progress:0};state.runs.unshift(run);state.runs=state.runs.slice(0,40);engine.currentRun=run;engineLog(run,'Execution started.');await persist();renderEngine();
  try{
    for(let i=0;i<flow.steps.length;i++){
      if(engine.stop||engine.runId!==runId)break;
      while(engine.paused&&!engine.stop&&engine.runId===runId){$('engineState').textContent='PAUSED';await sleep(160);}
      if(engine.stop||engine.runId!==runId)break;
      const raw=String(flow.steps[i]||'').trim();const special=raw.match(/^(DUPLICATES:SCAN|JSON:VALIDATE|CSV:CONVERT|BACKUP:PREPARE)(?:\s+(.*))?$/);const match=special||raw.match(/^([A-Z]+):\s*(.*)$/);const command=match?match[1]:'STEP';const arg=match?(match[2]||''):raw;
      run.progress=Math.round(i/Math.max(1,flow.steps.length)*100);engine.currentRun=run;$('engineBar').style.width=run.progress+'%';$('engineProgressPct').textContent=run.progress+'%';$('engineProgressText').textContent=`Step ${i+1} of ${flow.steps.length}: ${command}`;renderEngine();
      if(command==='TASK'){
        if(!arg.trim())throw new Error('TASK command needs a description.');state.tasks.unshift({id:uid(),title:arg.trim(),project:flow.title,note:'Created by Automation Forge workflow runner.',done:false,createdAt:new Date().toISOString()});engineLog(run,'Created task: '+arg.trim());await persist();
      }else if(command==='NOTE'){
        engineLog(run,arg||'Workflow note');
      }else if(command==='WAIT'){
        const seconds=Number(arg);if(!Number.isFinite(seconds)||seconds<0||seconds>300)throw new Error('WAIT accepts a number from 0 to 300 seconds.');engineLog(run,'Waiting '+seconds+' seconds.');const ok=await waitForEngine(seconds*1000,runId);if(!ok)break;
      }else if(command==='CHECK'){
        engineLog(run,'Approval checkpoint: '+arg);renderEngine();const approved=window.confirm('Automation Forge checkpoint\n\n'+arg+'\n\nContinue this workflow?');if(!approved){engine.stop=true;engineLog(run,'Stopped at checkpoint: approval was not granted.');break;}engineLog(run,'Checkpoint approved.');
      }else if(command==='COPY'){
        if(!navigator.clipboard?.writeText)throw new Error('Clipboard API unavailable in this browser context.');await navigator.clipboard.writeText(arg);engineLog(run,'Copied text to clipboard.');
      }else if(command==='DUPLICATES:SCAN'){
        const groups=exactDuplicateGroups();const count=groups.reduce((n,g)=>n+g.length-1,0);engineLog(run,groups.length?`Found ${groups.length} exact duplicate groups (${count} extra copies).`:'No SHA-256 duplicate groups in the current file index.');
      }else if(command==='JSON:VALIDATE'){
        JSON.parse($('dataInput').value);$('dataStatus').textContent='JSON validation passed.';engineLog(run,'JSON input validated successfully.');
      }else if(command==='CSV:CONVERT'){
        const converted=csvToJson($('dataInput').value);$('dataOutput').value=JSON.stringify(converted,null,2);$('dataStatus').textContent=`Converted ${converted.length} CSV rows.`;engineLog(run,`Converted ${converted.length} CSV data rows to JSON.`);
      }else if(command==='BACKUP:PREPARE'){
        prepareBackup();engineLog(run,'Backup prepared. Use the download link in Settings to save it.');
      }else if(command==='ANDROID'){
        const split=arg.indexOf(':');const kind=(split<0?arg:arg.slice(0,split)).trim().toLowerCase();const value=split<0?'':arg.slice(split+1).trim();let payload={action:kind};let summary='';
        if(kind==='toast'||kind==='speak'){payload.text=value;summary=value;}
        else if(kind==='notify'){const divider=value.indexOf('|');if(divider<1)throw new Error('ANDROID:NOTIFY format is Title|Message.');payload.title=value.slice(0,divider).trim();payload.text=value.slice(divider+1).trim();summary=payload.title+': '+payload.text;}
        else if(kind==='vibrate'){payload.duration=Number(value||250);summary=payload.duration+' ms';}
        else if(kind==='battery'){summary='Read current battery status';}
        else throw new Error('Unsupported ANDROID action. Use TOAST, NOTIFY, SPEAK, VIBRATE or BATTERY.');
        if(!window.confirm('Approve Android device action?\n\n'+kind.toUpperCase()+' · '+summary+'\n\nThis sends a request to your local Termux bridge.'))throw new Error('Android action was not approved.');
        const result=await androidBridgeRequest(payload.action,payload);engineLog(run,kind==='battery'?'Battery status: '+JSON.stringify(result.battery):'Android '+kind+' action completed.');
      }else{
        engineLog(run,'Checkpoint: '+raw);
      }
      await persist();renderEngine();renderHome();
    }
    if(engine.stop||engine.runId!==runId){run.status='stopped';engineLog(run,'Workflow stopped.');}else{run.progress=100;run.status='success';engineLog(run,'Workflow completed successfully.');}
  }catch(error){run.status='failed';engineLog(run,'ERROR: '+(error?.message||'Action failed'));console.error(error);}
  run.finishedAt=new Date().toISOString();engine.running=false;engine.paused=false;engine.stop=false;engine.currentRun=run;await persist();renderEngine();renderHome();toast(run.status==='success'?'Workflow completed.':run.status==='stopped'?'Workflow stopped.':'Workflow failed. Check the run log.');
}
function enginePause(){if(!engine.running)return toast('Engine is idle.');engine.paused=!engine.paused;$('engineState').textContent=engine.paused?'PAUSED':'RUNNING';toast(engine.paused?'Execution paused.':'Execution resumed.');}
function engineStop(){if(!engine.running)return toast('Engine is idle.');engine.stop=true;engine.paused=false;engine.runId++;$('engineState').textContent='STOPPING';toast('Stop requested.');}

/* Toolbox: file intake, checksums, CSV/JSON, text, images and ZIP packaging. */
async function sha256Blob(blob){if(!window.crypto?.subtle||!window.isSecureContext)return null;if(blob.size>MAX_HASH_BYTES)return null;const bytes=await blob.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function intakeFiles(fileList){const files=[...fileList||[]];if(!files.length)return;selectedFiles=files;let success=0;for(let i=0;i<files.length;i++){
  const file=files[i];let sha=null;try{sha=await sha256Blob(file);}catch(error){console.warn('Hash failed for '+file.name,error);}
  const relative=file.webkitRelativePath||file.name;const item={id:uid(),name:file.name,path:relative,size:file.size,type:file.type||'unknown',modified:file.lastModified||0,sha256:sha,hashMethod:sha?'SHA-256':file.size>MAX_HASH_BYTES?'Skipped (>64 MB)':'Unavailable in this browser context',indexedAt:new Date().toISOString()};
  const existing=state.fileRecords.find(x=>x.path===item.path&&x.size===item.size&&x.modified===item.modified);if(existing)Object.assign(existing,item,{id:existing.id});else state.fileRecords.unshift(item);success++;renderFileIndex(false);
}
  state.fileRecords=state.fileRecords.slice(0,600);await persist();renderFileIndex();renderHome();$('fileInput').value='';$('folderInput').value='';toast(`${success} file${success===1?'':'s'} inspected locally.`);
}
async function pickFiles(){if('showOpenFilePicker' in window&&window.isSecureContext){try{const handles=await window.showOpenFilePicker({multiple:true});const files=[];for(const handle of handles)files.push(await handle.getFile());await intakeFiles(files);return;}catch(error){if(error?.name==='AbortError')return;console.warn('Advanced file picker fallback:',error);}}$('fileInput').click();}
async function pickFolder(){if('showDirectoryPicker' in window&&window.isSecureContext){try{const root=await window.showDirectoryPicker({mode:'read'});const found=[];async function walk(dir,prefix=''){for await(const entry of dir.values()){if(entry.kind==='file'){const file=await entry.getFile();Object.defineProperty(file,'webkitRelativePath',{value:prefix+entry.name,configurable:true});found.push(file);}else if(entry.kind==='directory'&&found.length<600)await walk(entry,prefix+entry.name+'/');if(found.length>=600)break;}}await walk(root,root.name+'/');await intakeFiles(found);return;}catch(error){if(error?.name==='AbortError')return;console.warn('Folder picker fallback:',error);}}
  $('folderInput').click();
}
function renderFileIndex(doScan=true){const files=state.fileRecords.slice(0,80);$('fileSummary').firstElementChild.textContent=`${state.fileRecords.length} indexed file${state.fileRecords.length===1?'':'s'}`;const groups=exactDuplicateGroups();$('dupCount').textContent=groups.reduce((n,g)=>n+g.length-1,0)+' exact duplicates';$('fileTable').innerHTML=files.length?files.map(f=>`<div class="file-row"><div class="file-kind">${esc((f.name.split('.').pop()||'FILE').slice(0,4).toUpperCase())}</div><div class="row-copy"><div class="file-name">${esc(f.name)}</div><div class="file-meta">${esc(f.path)} · ${fmtBytes(f.size)} · ${esc(f.hashMethod)}</div></div><span class="file-flags">${f.sha256?'HASHED':'META'}</span></div>`).join(''):'<div class="empty-state">No files indexed yet.</div>';
  renderRenamePreview();
}
function scanDuplicates(){const groups=exactDuplicateGroups();const extra=groups.reduce((n,g)=>n+g.length-1,0);$('dupCount').textContent=extra+' exact duplicates';if(!groups.length){toast('No exact SHA-256 duplicates found.');return;}const lines=groups.map((g,i)=>`Group ${i+1}: ${g.map(x=>x.name).join(' / ')}`);$('fileSummary').firstElementChild.textContent=`${groups.length} exact duplicate groups`;toast(`${groups.length} duplicate groups found (${extra} extra copies).`);$('renamePreview').textContent=lines.join('\n');}
function clearFileIndex(){if(!confirm('Clear the file metadata index? Original files will not be affected.'))return;state.fileRecords=[];selectedFiles=[];persist();renderFileIndex();renderHome();toast('File index cleared.');}
function csvCell(value){const text=String(value??'');return /[\",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;}
function exportFileIndexCsv(){if(!state.fileRecords.length)return toast('No indexed files to export.');const cols=['name','path','size','type','modified','sha256','hashMethod','indexedAt'];const rows=[cols.join(','),...state.fileRecords.map(row=>cols.map(k=>csvCell(row[k])).join(','))];downloadBlob(new Blob([rows.join('\r\n')],{type:'text/csv;charset=utf-8'}),'forge-file-index.csv');toast('File index CSV exported.');}
function exportChecksumManifest(){const manifest={app:'Automation Forge',version:3,createdAt:new Date().toISOString(),algorithm:'SHA-256 where available',records:state.fileRecords.map(({name,path,size,type,modified,sha256,hashMethod})=>({name,path,size,type,modified,sha256,hashMethod}))};downloadBlob(new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}),'forge-checksum-manifest.json');toast('Checksum manifest exported.');}
function transformedName(file){const prefix=$('renamePrefix').value||'',suffix=$('renameSuffix').value||'',find=$('renameFind').value||'',replace=$('renameReplace').value||'';const rel=file.webkitRelativePath||file.name;const parts=rel.split('/');let base=parts.pop();const dot=base.lastIndexOf('.');const ext=dot>0?base.slice(dot):'';let stem=dot>0?base.slice(0,dot):base;if(find)stem=stem.split(find).join(replace);base=prefix+stem+suffix+ext;parts.push(base);return parts.join('/').replace(/^\/+|(?:^|\/)\.\.(?:\/|$)/g,'');}
function renderRenamePreview(){const files=selectedFiles.slice(0,100);$('renamePreview').textContent=files.length?files.slice(0,12).map(f=>`${f.name}  →  ${transformedName(f)}`).join('\n')+(files.length>12?`\n… and ${files.length-12} more`:''):'Select files first to preview names.';}
function safeArchivePath(value){return String(value??'').replace(/\\/g,'/').split('/').filter(part=>part&&part!=='.'&&part!=='..').join('/');}
function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=(c>>>8)^CRC_TABLE[(c^bytes[i])&0xff];return(c^0xffffffff)>>>0;}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255]);}function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);}
function dosDateTime(date=new Date()){const y=Math.max(1980,date.getFullYear());const time=(date.getHours()<<11)|(date.getMinutes()<<5)|(Math.floor(date.getSeconds()/2));const day=((y-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();return{time,date:day};}
async function makeStoredZip(files,nameFn){let total=files.reduce((n,f)=>n+f.size,0);if(total>MAX_ZIP_BYTES)throw new Error('Selected batch exceeds 80 MB. Split it into smaller ZIP batches.');const encoder=new TextEncoder();const local=[],central=[];let offset=0;const seen=new Set();const dt=dosDateTime();
  for(const file of files){const safe=safeArchivePath(nameFn(file));if(!safe)continue;let filename=safe,counter=1;while(seen.has(filename)){const dot=filename.lastIndexOf('.');filename=dot>0?filename.slice(0,dot)+' ('+counter+')'+filename.slice(dot):filename+' ('+counter+')';counter++;}seen.add(filename);const nameBytes=encoder.encode(filename);const data=new Uint8Array(await file.arrayBuffer());const crc=crc32(data);const localHeader=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(dt.time),...u16(dt.date),...u32(crc),...u32(data.length),...u32(data.length),...u16(nameBytes.length),...u16(0)]);local.push(localHeader,nameBytes,data);
    const centralHeader=new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(dt.time),...u16(dt.date),...u32(crc),...u32(data.length),...u32(data.length),...u16(nameBytes.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]);central.push(centralHeader,nameBytes);offset+=localHeader.length+nameBytes.length+data.length;
  }
  const centralSize=central.reduce((n,x)=>n+x.length,0);const count=seen.size;const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(count),...u16(count),...u32(centralSize),...u32(offset),...u16(0)]);return new Blob([...local,...central,end],{type:'application/zip'});
}
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function zipRenamed(){if(!selectedFiles.length)return toast('Select files in File intake first.');try{const blob=await makeStoredZip(selectedFiles,transformedName);downloadBlob(blob,'forge-renamed-files.zip');toast('Renamed ZIP created. Originals unchanged.');}catch(error){toast(error.message||'ZIP creation failed.');}}

async function hashText(){const text=$('hashInput').value;if(!window.crypto?.subtle||!window.isSecureContext){$('hashOutput').textContent='SHA-256 requires a secure browser context (HTTPS or localhost).';return;}const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));$('hashOutput').textContent=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function parseCSV(text){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(quoted){if(ch==='"'&&next==='"'){field+='"';i++;}else if(ch==='"'){quoted=false;}else field+=ch;}else if(ch==='"'&&field===''){quoted=true;}else if(ch===','){row.push(field);field='';}else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=ch;}if(quoted)throw new Error('CSV contains an unmatched quotation mark.');if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}return rows.filter(r=>r.some(v=>v!==''));}
function csvToJson(text){const rows=parseCSV(text);if(rows.length<2)return [];const width=Math.max(...rows.map(r=>r.length));const headers=Array.from({length:width},(_,i)=>(rows[0][i]||'').trim()||'column_'+(i+1));const unique=[];const used=new Set();for(const h of headers){let key=h,n=2;while(used.has(key))key=h+'_'+n++;used.add(key);unique.push(key);}return rows.slice(1).map(row=>{const obj={};unique.forEach((h,i)=>{obj[h]=row[i]??'';});return obj;});}
function jsonToCsv(text){const parsed=JSON.parse(text);const records=Array.isArray(parsed)?parsed:[parsed];if(!records.length)return '';if(records.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw new Error('JSON to CSV expects an object or an array of objects.');const headers=[...new Set(records.flatMap(Object.keys))];if(!headers.length)throw new Error('No object fields were found.');return [headers.map(csvCell).join(','),...records.map(row=>headers.map(key=>{const value=row[key];return csvCell(value&&typeof value==='object'?JSON.stringify(value):value);}).join(','))].join('\r\n');}
function jsonCsvAction(){try{$('dataOutput').value=jsonToCsv($('dataInput').value);$('dataStatus').textContent='JSON → CSV conversion completed locally.';toast('JSON converted to CSV.');}catch(error){$('dataStatus').textContent=error.message;toast(error.message);}}
function jsonAction(mode){try{const parsed=JSON.parse($('dataInput').value);$('dataOutput').value=mode==='minify'?JSON.stringify(parsed):JSON.stringify(parsed,null,2);$('dataStatus').textContent='Valid JSON · '+(mode==='minify'?'minified':'formatted')+' locally.';toast('JSON '+(mode==='minify'?'minified':'validated and formatted')+'.');}catch(error){$('dataStatus').textContent='JSON error: '+error.message;toast('Invalid JSON.');}}
async function copyText(value){if(!value)return toast('Nothing to copy.');try{await navigator.clipboard.writeText(value);toast('Copied to clipboard.');}catch{toast('Clipboard access is unavailable. Select and copy the text manually.');}}
function textTransform(mode){const input=$('textInput').value;let out=input;if(mode==='upper')out=input.toLocaleUpperCase();if(mode==='lower')out=input.toLocaleLowerCase();if(mode==='title')out=input.toLocaleLowerCase().replace(/(^|\s|[-_/])([\p{L}\p{N}])/gu,(m,a,b)=>a+b.toLocaleUpperCase());if(mode==='slug')out=input.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(mode==='clean')out=input.replace(/[\t ]+/g,' ').replace(/\s*\n\s*/g,'\n').trim();$('textOutput').value=out;}
function diffText(){const a=$('diffA').value.split(/\r?\n/),b=$('diffB').value.split(/\r?\n/);const setA=new Set(a),setB=new Set(b);const removed=a.filter(x=>!setB.has(x)),added=b.filter(x=>!setA.has(x));$('diffOutput').textContent=`Original lines: ${a.length}\nUpdated lines: ${b.length}\nRemoved / changed-out lines: ${removed.length}\nAdded / changed-in lines: ${added.length}\n\n− ${removed.slice(0,30).join('\n− ')}\n+ ${added.slice(0,30).join('\n+ ')}`;}
function base64Encode(text){const bytes=new TextEncoder().encode(text);let binary='';bytes.forEach(b=>binary+=String.fromCharCode(b));return btoa(binary);}
function base64Decode(text){const binary=atob(text.trim());const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);}
async function optimiseImage(){const file=$('imageInput').files?.[0];if(!file)return toast('Choose an image first.');try{const bitmap=await createImageBitmap(file);const max=Math.max(128,Math.min(8000,Number($('imageMax').value)||1600));const scale=Math.min(1,max/bitmap.width);const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d',{alpha:$('imageFormat').value==='image/webp'});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();const quality=Math.max(.2,Math.min(1,Number($('imageQuality').value)||.82));const blob=await new Promise(resolve=>canvas.toBlob(resolve,$('imageFormat').value,quality));if(!blob)throw new Error('Image conversion failed in this browser.');const ext=blob.type==='image/webp'?'webp':blob.type==='image/jpeg'?'jpg':'png';downloadBlob(blob,file.name.replace(/\.[^.]+$/,'')+'-optimised.'+ext);$('imageStatus').textContent=`${canvas.width} × ${canvas.height} · ${fmtBytes(file.size)} → ${fmtBytes(blob.size)} · ${Math.max(0,100-blob.size/file.size*100).toFixed(1)}% smaller`;toast('Optimised image downloaded.');}catch(error){$('imageStatus').textContent=error.message||'Image processing failed.';}}

/* Optional local Termux:API bridge. The bearer token is kept in memory only. */
function bridgeUrl(){const value=$('androidBridgeUrl').value.trim();const url=new URL(value);if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.pathname!=='/action'||url.search||url.hash)throw new Error('Use http://127.0.0.1:8766/action (or localhost), with no credentials or query string.');return url.toString();}
async function androidBridgeRequest(action,payload={}){const token=bridgeTokenSession||$('androidBridgeToken').value.trim();if(!token)throw new Error('Paste the current session token from Termux first.');const url=bridgeUrl();const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action,...payload}),redirect:'error'});let data={};try{data=await response.json();}catch{}if(!response.ok||!data.ok)throw new Error(data.error||'Bridge request failed · HTTP '+response.status);return data;}
async function testAndroidBridge(){const status=$('androidBridgeStatus');status.textContent='Testing loopback bridge…';try{const result=await androidBridgeRequest('ping');status.textContent=result.message||'Bridge connected.';toast('Android bridge connected.');}catch(error){status.textContent=error.message||'Bridge test failed.';toast('Android bridge unavailable.');}}
async function sendAndroidTestToast(){if(!confirm('Send a test toast to this Android phone?'))return;const status=$('androidBridgeStatus');try{const result=await androidBridgeRequest('toast',{text:'Automation Forge Android bridge is ready.'});status.textContent=result.message||'Test toast sent.';toast('Android toast sent.');}catch(error){status.textContent=error.message||'Bridge action failed.';toast('Android action failed.');}}
async function readAndroidBattery(){const status=$('androidBridgeStatus');try{const result=await androidBridgeRequest('battery');status.textContent='Battery: '+JSON.stringify(result.battery);toast('Battery status received.');}catch(error){status.textContent=error.message||'Battery query failed.';toast('Battery query failed.');}}

/* Generic webhook bridge. Secrets are transient and never persisted. */
function allowedEndpoint(value){const url=new URL(value);return url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname));}
function renderConnections(){
  $('webhookList').innerHTML=state.webhooks.length?state.webhooks.map(h=>`<div class="hook-row"><div class="row-copy"><b class="task-title">${esc(h.name)}</b><div class="hook-url">${esc(h.url)}</div></div><button class="mini-action" data-action="remove-webhook" data-id="${esc(h.id)}" aria-label="Remove endpoint">×</button></div>`).join(''):'<div class="empty-state">No webhook endpoints configured.</div>';
  $('hookSelect').innerHTML=state.webhooks.map(h=>`<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('')||'<option value="">No endpoint</option>';
  $('toolInventory').innerHTML=state.tools.length?state.tools.map(t=>`<div class="tool-row"><div class="tool-icon">⌁</div><div class="row-copy"><b class="task-title">${esc(t.name)}</b><div class="task-meta">${esc(t.kind)} · ${esc(t.status)}</div><div class="task-meta">${esc(t.notes||'')}</div></div><button class="mini-action" data-action="remove-tool" data-id="${esc(t.id)}">×</button></div>`).join(''):'<div class="empty-state">Capability inventory is empty.</div>';
  $('discoveryList').innerHTML=state.discovery.map((d,i)=>`<div class="task-item"><button class="task-check" data-action="toggle-discovery" data-index="${i}">${d.done?'✓':''}</button><div class="task-copy"><div class="task-title">${esc(d.label)}</div></div></div>`).join('');
}
async function addWebhook(){const name=$('hookName').value.trim(),value=$('hookUrl').value.trim();if(!name||!value)return toast('Enter a connection name and endpoint URL.');try{const url=new URL(value);if(!allowedEndpoint(value)||url.username||url.password)throw new Error('Use an HTTPS endpoint, or localhost for local testing. Credentials in the URL are not allowed.');}catch(error){return toast(error.message||'Invalid endpoint URL.');}state.webhooks.unshift({id:uid(),name,url:value,addedAt:new Date().toISOString()});$('hookName').value='';$('hookUrl').value='';await persist();renderConnections();toast('Endpoint saved. It has not been contacted.');}
async function sendWebhook(){const hook=state.webhooks.find(x=>x.id===$('hookSelect').value);if(!hook)return toast('Add or select an endpoint first.');let payload;try{payload=JSON.parse($('hookPayload').value);}catch{return toast('Payload must be valid JSON.');}const token=$('hookToken').value.trim();if(!confirm(`Send this payload to ${hook.name}?\n\n${hook.url}\n\nOnly continue if you trust and control this endpoint.`))return;
  if(!navigator.onLine&&!token){await queueWebhook(hook,payload);$('hookStatus').textContent='Offline. Payload queued for retry when the app or supported service worker is active.';return;}
  try{const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;const response=await fetch(hook.url,{method:'POST',headers,body:JSON.stringify(payload),redirect:'error'});if(!response.ok)throw new Error('Endpoint returned HTTP '+response.status);$('hookStatus').textContent='Sent successfully · HTTP '+response.status;toast('Webhook sent.');}
  catch(error){if(!token&&error instanceof TypeError){await queueWebhook(hook,payload);$('hookStatus').textContent='Network/CORS request failed. Unauthenticated payload queued for retry; check endpoint CORS and availability.';}else{$('hookStatus').textContent='Send failed: '+(error.message||'Network error')+'. The token was not saved.';toast('Webhook could not be sent.');}}
  $('hookToken').value='';
}
async function queueWebhook(hook,payload){const record={id:uid(),url:hook.url,payload,createdAt:new Date().toISOString(),attempts:0,failed:false};try{if(db)await dbPut(OUTBOX,record);else throw new Error('No outbox store');toast('Payload queued locally.');try{const reg=await navigator.serviceWorker?.ready;if(reg?.sync?.register)await reg.sync.register('forge-outbox');}catch(error){console.warn('Background sync registration not available:',error);}}catch(error){toast('Could not queue payload. Keep the app open and retry manually.');}}
async function flushOutbox(){if(!db||!navigator.onLine)return;let records=[];try{records=await dbAll(OUTBOX);}catch{return;}for(const item of records){if(item.failed)continue;try{const response=await fetch(item.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item.payload),redirect:'error'});if(response.ok){await dbDelete(OUTBOX,item.id);}else{item.attempts=(item.attempts||0)+1;item.lastError='HTTP '+response.status;if(item.attempts>=5)item.failed=true;await dbPut(OUTBOX,item);}}catch(error){item.attempts=(item.attempts||0)+1;item.lastError='Network/CORS failure';if(item.attempts>=5)item.failed=true;await dbPut(OUTBOX,item);break;}}}

/* Backups are JSON; binary source files stay on-device and are not bundled. */
function backupObject(){return{app:'Automation Forge',version:3,exportedAt:new Date().toISOString(),workspace:state,notice:'File records are metadata only. Original device files and webhook bearer tokens are not included.'};}
function prepareBackup(){if(backupObjectUrl)URL.revokeObjectURL(backupObjectUrl);const blob=new Blob([JSON.stringify(backupObject(),null,2)],{type:'application/json'});backupObjectUrl=URL.createObjectURL(blob);$('backupStatus').innerHTML=`Backup prepared (${fmtBytes(blob.size)}). <a class="inline-link" href="${backupObjectUrl}" download="automation-forge-v3-backup.json">Download backup ↧</a>`;return blob;}
function exportBackup(){const blob=prepareBackup();downloadBlob(blob,'automation-forge-v3-backup.json');toast('Workspace backup exported.');}
async function importBackup(file){if(!file)return;try{const parsed=JSON.parse(await file.text());const incoming=parsed.workspace||parsed;if(!Array.isArray(incoming.tasks)||!Array.isArray(incoming.flows))throw new Error('This does not look like a Forge workspace backup.');if(!confirm('Replace this browser workspace with the imported backup? Existing tasks and workflows will be replaced.'))return;state=normaliseState(incoming);await persist();renderAll();toast('Backup restored.');$('backupStatus').textContent='Backup restored successfully.';}catch(error){toast(error.message||'Backup import failed.');}}
async function renderStorage(){let report=[];report.push(['Storage backend',storageMode==='indexedDB'?'IndexedDB':storageMode==='localStorage'?'Browser local storage':'Session memory only · export backup']);report.push(['Tasks',state.tasks.length]);report.push(['Workflows',state.flows.length]);report.push(['File metadata records',state.fileRecords.length]);report.push(['Webhook endpoints',state.webhooks.length]);report.push(['Run history',state.runs.length]);try{const estimate=await navigator.storage?.estimate?.();if(estimate){report.push(['Estimated usage',fmtBytes(estimate.usage||0)]);report.push(['Estimated quota',fmtBytes(estimate.quota||0)]);}}catch{}try{const queued=db?await dbAll(OUTBOX):[];report.push(['Queued webhook payloads',queued.length]);}catch{}$('storageReport').innerHTML=report.map(([a,b])=>`<div class="storage-line"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('');}
async function resetWorkspace(){if(!confirm('Reset the Forge workspace? This deletes tasks, workflows, indexes, logs and configured endpoints from this browser. Original files are untouched.'))return;if(!confirm('Final check: export your backup first if you may need this data. Continue with reset?'))return;state=starterState();try{if(db){await dbPut(STORE,{id:APP_KEY,data:state});const items=await dbAll(OUTBOX);for(const x of items)await dbDelete(OUTBOX,x.id);}}catch{}try{localStorage.removeItem('automation_forge_v3_fallback');}catch{}await persist();renderAll();toast('Workspace reset.');}

function renderCapabilities(){const capabilities=[['IndexedDB',storageMode==='indexedDB'?'Active':!!window.indexedDB?'Available (not active)':'Unavailable'],['File picker',('showOpenFilePicker'in window)?'Advanced picker':'Standard picker'],['Folder picker',('showDirectoryPicker'in window)?'Available':'Input fallback'],['SHA-256',window.crypto?.subtle&&window.isSecureContext?'Available':'Needs HTTPS / localhost'],['Service worker','serviceWorker'in navigator&&window.isSecureContext?'Available':'Needs HTTPS / localhost'],['Background sync',('serviceWorker'in navigator)?'Optional; foreground fallback':'Foreground retry']];$('capabilityList').innerHTML=capabilities.map(([k,v])=>`<div class="cap-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('');}
function renderAll(){renderHome();renderTasks();renderFlows();renderEngine();renderConnections();renderFileIndex();renderCapabilities();}

function installPWA(){if(deferredInstall){deferredInstall.prompt();deferredInstall.userChoice.then(choice=>{toast(choice.outcome==='accepted'?'App installation accepted.':'Installation dismissed.');deferredInstall=null;$('installBtn').hidden=true;});return;}if(location.protocol==='file:'){toast('PWA install requires HTTPS or localhost. The standalone file still works locally.');return;}toast('Use the browser menu → Install app / Add to Home screen.');}
function setupPWA(){if('serviceWorker'in navigator&&window.isSecureContext){navigator.serviceWorker.register('./sw.js').then(()=>{$('pwaStatus').textContent='Offline shell registered. Open once online, then the app shell can load offline.';}).catch(error=>{$('pwaStatus').textContent='Service worker registration failed: '+error.message;});}else{$('pwaStatus').textContent='Open this package from HTTPS or http://localhost to enable install + offline shell. Standalone HTML works without a server.';}
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;$('installBtn').hidden=false;});window.addEventListener('appinstalled',()=>{deferredInstall=null;$('installBtn').hidden=true;$('pwaStatus').textContent='App installed.';});}
function updateNetwork(){const badge=$('networkBadge');badge.classList.toggle('online',navigator.onLine);badge.classList.toggle('offline',!navigator.onLine);badge.innerHTML=`<i></i>${navigator.onLine?'Online':'Offline'}`;}

/* Event wiring */
document.addEventListener('click',async event=>{
  const nav=event.target.closest('[data-view]');if(nav){go(nav.dataset.view);return;}
  const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action,id=button.dataset.id;
  try{
    switch(action){
      case 'quick-task':openDialog('task');break;
      case 'new-flow':openDialog('flow');break;
      case 'add-tool':openDialog('tool');break;
      case 'open-toolbox':go('toolbox');break;
      case 'toggle-task':{const t=state.tasks.find(x=>x.id===id);if(t){t.done=!t.done;await persist();renderAll();}break;}
      case 'edit-task':openDialog('task',id);break;
      case 'delete-task':if(confirm('Delete this task?')){state.tasks=state.tasks.filter(x=>x.id!==id);await persist();renderAll();}break;
      case 'edit-flow':openDialog('flow',id);break;
      case 'delete-flow':if(confirm('Delete this workflow?')){state.flows=state.flows.filter(x=>x.id!==id);await persist();renderAll();}break;
      case 'launch-flow':go('engine');$('engineFlow').value=id;renderEngine();break;
      case 'load-recipe':loadRecipe(Number(button.dataset.index));break;
      case 'show-commands':go('engine');break;
      case 'engine-run':engineRun();break;
      case 'engine-pause':enginePause();break;
      case 'engine-stop':engineStop();break;
      case 'clear-runs':if(confirm('Clear run history?')){state.runs=[];await persist();renderEngine();renderHome();}break;
      case 'pick-files':await pickFiles();break;
      case 'pick-folder':pickFolder();break;
      case 'scan-duplicates':scanDuplicates();break;
      case 'export-file-index':exportFileIndexCsv();break;
      case 'export-checksum-manifest':exportChecksumManifest();break;
      case 'clear-file-index':clearFileIndex();break;
      case 'zip-renamed':await zipRenamed();break;
      case 'hash-text':await hashText();break;
      case 'json-format':jsonAction('format');break;
      case 'json-minify':jsonAction('minify');break;
      case 'csv-convert':{try{const out=csvToJson($('dataInput').value);$('dataOutput').value=JSON.stringify(out,null,2);$('dataStatus').textContent=`CSV conversion successful · ${out.length} rows.`;toast('CSV converted to JSON.');}catch(error){$('dataStatus').textContent=error.message;toast(error.message);}break;}case 'json-csv':jsonCsvAction();break;
      case 'copy-data-output':await copyText($('dataOutput').value);break;
      case 'text-upper':textTransform('upper');break;case 'text-lower':textTransform('lower');break;case 'text-title':textTransform('title');break;case 'text-slug':textTransform('slug');break;case 'text-clean':textTransform('clean');break;
      case 'copy-text':await copyText($('textOutput').value);break;
      case 'diff-text':diffText();break;
      case 'url-encode':$('encodeOutput').value=encodeURIComponent($('encodeInput').value);break;
      case 'url-decode':try{$('encodeOutput').value=decodeURIComponent($('encodeInput').value);}catch{$('encodeOutput').value='Invalid URL-encoded text.';}break;
      case 'base64-encode':try{$('encodeOutput').value=base64Encode($('encodeInput').value);}catch(error){$('encodeOutput').value=error.message;}break;
      case 'base64-decode':try{$('encodeOutput').value=base64Decode($('encodeInput').value);}catch{$('encodeOutput').value='Invalid Base64 input.';}break;
      case 'optimise-image':await optimiseImage();break;
      case 'test-android-bridge':await testAndroidBridge();break;case 'send-android-toast':await sendAndroidTestToast();break;case 'read-android-battery':await readAndroidBattery();break;
      case 'add-webhook':await addWebhook();break;
      case 'remove-webhook':if(confirm('Remove this endpoint configuration?')){state.webhooks=state.webhooks.filter(x=>x.id!==id);await persist();renderConnections();}break;
      case 'send-webhook':await sendWebhook();break;
      case 'remove-tool':state.tools=state.tools.filter(x=>x.id!==id);await persist();renderConnections();break;
      case 'toggle-discovery':{const x=state.discovery[Number(button.dataset.index)];if(x){x.done=!x.done;await persist();renderConnections();}break;}
      case 'export':exportBackup();break;
      case 'import-pick':$('backupInput').click();break;
      case 'install':installPWA();break;
      case 'refresh-storage':await renderStorage();toast('Storage report refreshed.');break;
      case 'reset':await resetWorkspace();break;
    }
  }catch(error){console.error(error);toast(error.message||'Action could not be completed.');}
});
$('androidBridgeToken').addEventListener('input',e=>{bridgeTokenSession=e.target.value;});
$('fileInput').addEventListener('change',e=>intakeFiles(e.target.files));$('folderInput').addEventListener('change',e=>intakeFiles(e.target.files));$('backupInput').addEventListener('change',e=>importBackup(e.target.files?.[0]));$('taskSearch').addEventListener('input',renderTasks);$('taskFilter').addEventListener('change',renderTasks);$('engineFlow').addEventListener('change',renderEngine);['renamePrefix','renameSuffix','renameFind','renameReplace'].forEach(id=>$ (id).addEventListener('input',renderRenamePreview));
const drop=$('fileDrop');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragover');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragover');intakeFiles(e.dataTransfer.files);});
window.addEventListener('online',()=>{updateNetwork();flushOutbox();});window.addEventListener('offline',updateNetwork);

async function init(){state=await loadState();await persist();renderAll();setupPWA();updateNetwork();await renderStorage();if(navigator.onLine)flushOutbox();}
init().catch(error=>{console.error(error);toast('Forge could not initialise. Export or reload if the problem persists.');});
