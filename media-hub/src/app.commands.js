/* ===================== COMMANDS: one engine for typed commands, quick actions and voice ===================== */
/* Plain English in, an action out. Content requests ("show me unseen videos from Drive") become search-language queries
   you can see and edit in the search box, so nothing is hidden. Everything runs on this device; nothing is sent anywhere. */
const NUMW = { zero: 0, one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90, a: 1, an: 1, half: 0.5, double: 2 };
function numFrom(s) {
  s = String(s || '').trim().replace(/^(a|an) /, ''); if (/^\d+(\.\d+)?$/.test(s)) return +s;
  if (s in NUMW) return NUMW[s];
  let m = /^(twenty|thirty|forty|fifty) ?(one|two|three|four|five|six|seven|eight|nine)$/.exec(s); if (m) return NUMW[m[1]] + NUMW[m[2]];
  m = /^(\w+) point (\w+)$/.exec(s); if (m && m[1] in NUMW && m[2] in NUMW) return +(NUMW[m[1]] + '.' + NUMW[m[2]]);
  return NaN;
}
function normCmd(raw) {
  let t = String(raw || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”"]/g, '').replace(/[!?,;]+|\.(?!\d)|(?<!\d)\./g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4; i++) t = t.replace(/^(?:(?:hey|ok|okay|hi) )?(?:media )?hub\b[ ,:-]*/, '').replace(/^(?:please|can you|could you|would you|will you|i want to|i'd like to|i would like to|let's|lets|go ahead and|now|just|and|then|um|uh|so)\s+/, '').trim();
  return t.replace(/\s+(?:please|thanks|thank you|now)$/, '').trim();
}
const UNIT = '(seconds?|secs?|minutes?|mins?)';
const NUM = '([\\w.]+(?: (?:one|two|three|four|five|six|seven|eight|nine|point \\w+))?)';
const secsOf = (n, u) => (/^min/.test(u || 's') ? 60 : 1) * n;
const CMD_RULES = [
  [/^(?:help|what can i say|what can you do|commands|voice commands|show (?:me )?(?:the )?commands|how does this work|list commands)$/, () => ({ t: 'help' })],
  [/^(?:keep listening|hands[- ]?free|listen continuously|start listening|always listen|stay listening)$/, () => ({ t: 'listen', on: true })],
  [/^(?:stop listening|stop voice|mic off|microphone off|that's all|goodbye|bye)$/, () => ({ t: 'listen', on: false })],
  [/^undo(?: that| it)?$/, () => ({ t: 'undo' })],
  [/^(?:close|exit|done|dismiss|go back|back|cancel|never mind|nevermind|close (?:this|it|the viewer|the feed))$/, () => ({ t: 'close' })],
  [/^(?:go |open (?:the )?)?home(?: screen| page| tab)?$/, () => ({ t: 'tab', tab: 'library' })],
  [/^(?:open |go to |show )?(?:the )?(?:tools|settings|options|preferences)$/, () => ({ t: 'tab', tab: 'tools' })],
  /* playback */
  [/^(?:play|resume|continue|unpause|keep playing|go|play it|play this)$/, () => ({ t: 'play' })],
  [/^(?:pause|hold|wait|hold on|freeze)(?: it| this| (?:the )?video)?$/, () => ({ t: 'pause' })],
  [/^stop(?: it| this| playing| playback| the video)?$/, () => ({ t: 'stop' })],
  [/^(?:next|next one|skip|skip this|skip it|swipe up|move on|following)$/, () => ({ t: 'next' })],
  [/^(?:previous|prev|last one|previous one|go back one|back one|swipe down)$/, () => ({ t: 'prev' })],
  [/^(?:restart|start over|replay|from the (?:beginning|start)|play (?:it )?again|rewind (?:to the )?(?:start|beginning))$/, () => ({ t: 'restart' })],
  [new RegExp('^(?:skip|forward|fast forward|go forward|jump ahead|skip ahead|skip forward|ahead)(?: by)? ' + NUM + '(?: ' + UNIT + ')?$'), m => ({ t: 'seek', d: secsOf(numFrom(m[1]), m[2]) })],
  [new RegExp('^(?:back|rewind|go back|jump back|skip back|backward|backwards)(?: by)? ' + NUM + '(?: ' + UNIT + ')?$'), m => ({ t: 'seek', d: -secsOf(numFrom(m[1]), m[2]) })],
  [/^(?:go to|jump to|seek to|skip to)(?: time)? (\d+):(\d{2})$/, m => ({ t: 'seekto', s: +m[1] * 60 + +m[2] })],
  [new RegExp('^(?:go to|jump to|seek to|skip to) ' + NUM + ' ' + UNIT + '(?: (?:and )?' + NUM + ' (?:seconds?|secs?))?$'), m => ({ t: 'seekto', s: secsOf(numFrom(m[1]), m[2]) + (m[3] ? numFrom(m[3]) : 0) })],
  [/^(?:faster|speed up|go faster|quicker|speed it up)$/, () => ({ t: 'speed', d: 1 })],
  [/^(?:slower|slow down|go slower|slow motion|slow mo|slow it down)$/, () => ({ t: 'speed', d: -1 })],
  [/^(?:(?:normal|regular|default|real) speed|speed normal|normal)$/, () => ({ t: 'speed', v: 1 })],
  [/^(?:double speed|twice as fast|2x)$/, () => ({ t: 'speed', v: 2 })],
  [/^half speed$/, () => ({ t: 'speed', v: 0.5 })],
  [new RegExp('^(?:speed|play at|playback speed|set speed)(?: to)? ' + NUM + '(?: ?x| times)?(?: speed)?$'), m => ({ t: 'speed', v: numFrom(m[1]) })],
  [/^(?:loop|repeat|loop (?:it|this|on)|repeat (?:it|this|on)|keep looping|on repeat)$/, () => ({ t: 'loop', on: true })],
  [/^(?:loop off|stop looping|no loop|don't loop|repeat off|unloop)$/, () => ({ t: 'loop', on: false })],
  [/^(?:mute|sound off|silence|quiet|be quiet|turn (?:the )?sound off|mute (?:it|this))$/, () => ({ t: 'mute', on: true })],
  [/^(?:unmute|sound on|turn (?:the )?sound on|with sound|unmute (?:it|this))$/, () => ({ t: 'mute', on: false })],
  [/^(?:louder|volume up|turn it up|increase (?:the )?volume|more volume)$/, () => ({ t: 'vol', d: 0.15 })],
  [/^(?:quieter|softer|volume down|turn it down|decrease (?:the )?volume|less volume)$/, () => ({ t: 'vol', d: -0.15 })],
  [/^(?:full ?screen|go full ?screen|theatre|theater|cinema(?: mode)?|exit full ?screen|leave full ?screen|big screen)$/, () => ({ t: 'full' })],
  [/^(?:picture in picture|pip|float|pop ?out|mini player|floating player)$/, () => ({ t: 'pip' })],
  [/^(?:start (?:a )?)?slide ?show$/, () => ({ t: 'slideshow' })],
  [/^(?:save (?:this )?frame|screenshot|capture(?: this)?(?: frame)?|grab (?:a )?frame)$/, () => ({ t: 'frame' })],
  [new RegExp('^(?:sleep|sleep timer|turn off|stop|pause)(?: in| after| for)? ' + NUM + ' (?:minutes?|mins?)$'), m => ({ t: 'sleep', v: String(numFrom(m[1])) })],
  [/^(?:(?:sleep|stop|pause) (?:at|after) (?:the )?end(?: of (?:the |this )?(?:video|clip))?|stop after this(?: one)?)$/, () => ({ t: 'sleep', v: 'end' })],
  [/^(?:sleep off|cancel (?:the )?sleep(?: timer)?|no sleep timer)$/, () => ({ t: 'sleep', v: '0' })],
  [/^zoom in$/, () => ({ t: 'zoom', d: 1 })], [/^zoom out$/, () => ({ t: 'zoom', d: -1 })], [/^(?:reset zoom|zoom to fit|fit (?:to )?screen|actual size)$/, () => ({ t: 'zoom', d: 0 })],
  [/^rotate(?: (?:it|this))?(?: (left|right))?$/, m => ({ t: 'rotate', dir: m[1] === 'left' ? -90 : 90 })],
  [/^(?:lock (?:the )?controls|lock touch|unlock (?:the )?controls)$/, () => ({ t: 'lockctl' })],
  [/^(?:panic|hide(?: (?:the )?screen)?|cover(?: (?:the )?screen)?|lock(?: (?:the )?(?:app|screen))?|privacy screen|emergency)$/, () => ({ t: 'panic' })],
  [/^(?:blur|blur on|blur thumbnails|hide thumbnails|turn (?:the )?blur on)$/, () => ({ t: 'blur', on: true })],
  [/^(?:unblur|blur off|show thumbnails|no blur|turn (?:the )?blur off)$/, () => ({ t: 'blur', on: false })],
  [/^toggle blur$/, () => ({ t: 'blur' })],
  [/^(?:switch to |use |go |turn on )?(dark|light|oled|black)(?: mode| theme)?$/, m => ({ t: 'theme', v: m[1] === 'black' ? 'oled' : m[1] })],
  /* organise the item in view (or your selection) */
  [/^(?:add (?:this |it |these |them )?to (?:my )?favou?rites|i (?:like|love) (?:this|it)|(?:favou?rite|star|like|love|heart)(?: (?:this|it|that|these|them))?(?: one)?)$/, () => ({ t: 'fav', on: true })],
  [/^(?:unfavou?rite|unstar|unlike|remove (?:this |it )?from (?:my )?favou?rites|not a favou?rite)(?: (?:this|it))?$/, () => ({ t: 'fav', on: false })],
  [/^(?:rate|give)(?: (?:this|it|that))? (\w+)(?: stars?| out of (?:five|5))?$/, m => ({ t: 'rate', n: numFrom(m[1]) })],
  [/^(\w+) stars?$/, m => ({ t: 'rate', n: numFrom(m[1]) })],
  [/^(?:tag|label)(?: (?:this|it|these|them))?(?: (?:as|with))? (.+)$/, m => ({ t: 'tag', v: m[1] })],
  [/^add (?:the )?tags? (.+)$/, m => ({ t: 'tag', v: m[1] })],
  [/^(?:note|add (?:a )?note|write (?:a )?note|make a note)(?: that)?[: ]+(.+)$/, m => ({ t: 'note', v: m[1] })],
  [/^(?:new|create|make)(?: a)?(?: new)? folder(?: called| named)? (.+?)(?: (?:in|inside|under)(?: the)? (.+?)(?: folder)?)?$/, m => ({ t: 'newfolder', v: m[1], parent: m[2] || '' })],
  [/^(?:new|create|make|start)(?: a)?(?: new)? (?:collection|playlist)(?: called| named)? (.+)$/, m => ({ t: 'newcol', v: m[1] })],
  [/^(?:file|move|put|send|store|keep)(?: (?:this|it|that|these|them|all of (?:these|them)))?(?: one)? (?:in|into|to|under|inside)(?: the| my)? (.+?)(?: folder)?$/, m => ({ t: 'file', v: m[1] })],
  [/^add(?: (?:this|it|that|these|them))? to(?: the| my)? (?:collection |playlist )?(.+?)(?: collection| playlist)?$/, m => ({ t: 'collect', v: m[1] })],
  [/^(?:delete|trash|remove|bin|throw away|get rid of|move to (?:the )?trash)(?: (?:this|it|that|these|them))?(?: one)?$/, () => ({ t: 'trash' })],
  [/^(?:restore|undelete|bring back|recover)(?: (?:this|it|that|these|them))?$/, () => ({ t: 'restore' })],
  [/^(?:archive|hide this|hide it|put away)(?: (?:this|it|that|these|them))?$/, () => ({ t: 'archive' })],
  [/^(?:unarchive|unhide)(?: (?:this|it))?$/, () => ({ t: 'unarchive' })],
  [/^(?:select|select mode|start selecting|pick|choose)$/, () => ({ t: 'select' })],
  [/^select (?:all|everything)$/, () => ({ t: 'select', all: true })],
  [/^(?:deselect|select none|clear selection|stop selecting|done selecting)$/, () => ({ t: 'deselect' })],
  [/^(?:details|info|information|properties|what is this|tell me about (?:this|it)|show details|more info)$/, () => ({ t: 'details' })],
  [/^(?:copy (?:the )?(?:app )?link|get (?:a )?link(?: to (?:this|it))?)$/, () => ({ t: 'copylink' })],
  [/^(?:share|share (?:this|it|these|them)(?: with (?:everyone|others|people))?|(?:add|put|send|copy) (?:this|it|these|them) (?:to|in|into) (?:the |my )?shared(?: folder| space)?)$/, () => ({ t: 'share' })],
  [/^(?:unshare|stop sharing|remove from shared|unshare (?:this|it|these|them)|stop sharing (?:this|it|these|them)|remove (?:this|it|these|them) from shared)$/, () => ({ t: 'unshare' })],
  [/^(?:(?:save|keep|copy) (?:this|it|these|them) (?:to|in|into) my library|save to my library|keep (?:this|it) for myself)$/, () => ({ t: 'keep' })],
  [/^(?:(?:make|export|create|send)(?: a| my)? share ?pack|export (?:my )?shared(?: items)?)$/, () => ({ t: 'pack' })],
  [/^(?:import|open|add)(?: a)? share ?pack$/, () => ({ t: 'importpack' })],
  [/^(?:(?:connect|link)(?: a| the| my)? shared folder|sync(?: the)? shared(?: folder)?)$/, () => ({ t: 'connectshared' })],
  [/^(?:(?:change|set) my (?:shared )?name(?: to (.+))?|my name is (.+)|call me (.+))$/, m => ({ t: 'profile', v: m[1] || m[2] || m[3] || '' })],
  [/^save (?:this |the )?search(?: as (.+))?$/, m => ({ t: 'savesearch', v: m[1] || '' })],
  /* add things */
  [/^(?:add|upload|import)(?: (?:some |new |more )?(?:files?|photos?|pictures?|videos?|media|stuff|audio|music))?$/, () => ({ t: 'add', v: 'files' })],
  [/^(?:add|import|copy in|upload)(?: a| my)? (?:whole )?folder$/, () => ({ t: 'add', v: 'folder' })],
  [/^(?:link|connect|attach)(?: a| my)?(?: device| local)? (?:folder|library|directory)$|^link folder$/, () => ({ t: 'add', v: 'link' })],
  [/^(?:(?:take|snap|capture|shoot)(?: a)? (?:photo|picture|pic|selfie|video)|camera|open (?:the )?camera|record(?: a)? video)$/, () => ({ t: 'add', v: 'camera' })],
  [/^(?:save|add)(?: a)? link(?: (.+))?$/, m => ({ t: 'add', v: 'url', url: m[1] || '' })],
  [/^paste(?: it| this| from (?:the )?clipboard)?$/, () => ({ t: 'add', v: 'paste' })],
  [/^import(?: a)? catalog(?:ue)?(?: file)?$/, () => ({ t: 'add', v: 'catalog' })],
  [/^(?:load |show |connect |refresh )?(?:my )?phone folders$|^(?:load |connect )(?:the )?server(?: library)?$/, () => ({ t: 'add', v: 'server' })],
  [/^(?:(?:export|copy|save)(?: my| the)? library(?: to (?:a )?(?:real )?folder)?|(?:make|create|build)(?: a| the| my)? master folder|export to (?:a )?(?:real )?folder)$/, () => ({ t: 'master' })],
  /* tools */
  [/^(?:verify|check)(?: (?:my |the )?(?:originals|files|media|hashes))?$/, () => ({ t: 'tool', v: 'verify' })],
  [/^(?:find|check for|look for) (?:duplicates|dupes|copies)$/, () => ({ t: 'tool', v: 'dupes' })],
  [/^(?:back ?up|export (?:a )?back ?up|save (?:a )?back ?up|make (?:a )?back ?up)$/, () => ({ t: 'tool', v: 'backup' })],
  [/^(?:copy|share|send|export)(?: the| my)? diagnostics?(?: report)?$/, () => ({ t: 'tool', v: 'copydiag' })],
  [/^(?:run )?(?:self[- ]?test|diagnostics?|health check)$/, () => ({ t: 'tool', v: 'selftest' })],
  [/^(?:make|save|create|add)(?: a)? (?:restore|save) point(?: now)?$|^snapshot(?: now)?$/, () => ({ t: 'tool', v: 'rpnow' })],
  [/^(?:show |open )?(?:my )?(?:restore|save) points$|^(?:go back|undo everything|roll ?back)(?: to (?:a |an )?(?:earlier|restore point|yesterday))?$/, () => ({ t: 'tool', v: 'rplist' })],
  [/^lock(?: my| the)? (?:encrypted )?notes$/, () => ({ t: 'tool', v: 'nvlock' })],
  [/^unlock(?: my| the)? (?:encrypted )?notes$/, () => ({ t: 'tool', v: 'nvunlock' })],
  [/^encrypt(?: all| my| all my| every)? notes$/, () => ({ t: 'tool', v: 'nvall' })],
  [/^encrypt (?:this|the|that) note$|^(?:make|keep) (?:this|the) note (?:private|secret|encrypted)$/, () => ({ t: 'tool', v: 'nvthis' })],
  [/^(?:where are my files|where is (?:my|the) library|where(?:'s| is) everything|library location|show (?:me )?(?:the |my )?(?:library )?location|storage|show (?:me )?(?:the )?storage|where do my files live)$/, () => ({ t: 'tool', v: 'where' })],
  [/^(?:download (?:the )?(?:companion )?kit|get (?:the )?kit)$/, () => ({ t: 'tool', v: 'kit' })],
  [/^(?:view|show|open|browse)(?: me)? (?:the )?(?:companion )?kit(?: files)?$/, () => ({ t: 'tool', v: 'kitview' })],
  [/^(?:search|look up|find)(?: on)? (?:the )?(?:web|internet|online)(?: for)? (.+)$|^(?:google|bing|web search|search online for|search the web for) (.+)$/, m => ({ t: 'web', v: m[1] || m[2] })],
  [/^(?:shuffle|surprise me|random|something random|anything|play something|play anything|surprise|feeling lucky|i'm feeling lucky|roll the dice)$/, () => ({ t: 'shuffle' })],
  [/^(?:scroll|start scrolling|scroll mode|feed|swipe|reels?(?: mode)?|tiktok mode)$/, () => ({ t: 'scroll' })],
  [/^shuffle (.+)$/, m => ({ t: 'pre', how: 'shuffle', x: m[1] })],
  [/^(?:scroll|swipe)(?: through| me)? (.+)$/, m => ({ t: 'pre', how: 'scroll', x: m[1] })],
  [/^(?:open|go to|goto|take me to|browse|navigate to|switch to)(?: the| my(?! shared))? (.+)$/, m => ({ t: 'pre', how: 'open', x: m[1] })],
  [/^(?:show(?: me)?|display|view|list|give me|get me|bring up|pull up|let me see|i want to see|i wanna see|find(?: me)?|search(?: for)?|look for|filter(?: by)?|only show|just show)(?: (?:all|every|some|any))?(?: (?:the|my|of my))? (.+)$/, m => ({ t: 'pre', how: 'show', x: m[1] })],
  [/^(?:play|watch|put on|start playing|start)(?: (?:all|every|some|the|my|me|of))* (.+)$/, m => ({ t: 'pre', how: 'play', x: m[1] })]
];
/* ---------- content requests → search language ---------- */
const VOCAB = [
  [/\b(?:without|no) (?:sound|audio)\b|\bsilent\b|\bmuted\b/, 'is:silent', 'silent'],
  [/\bwith (?:sound|audio)\b/, '-is:silent', 'with sound'],
  [/\b(?:unseen|unwatched|unopened|new to me|not (?:yet )?(?:seen|watched|opened)|(?:i )?(?:haven't|have not|never) (?:seen|watched|opened)(?: yet)?)\b/, 'is:unseen', 'not opened yet'],
  [/\b(?:recently (?:opened|watched|viewed|played)|last (?:opened|watched|viewed))\b/, 'is:seen', 'recently opened', 'recent'],
  [/\b(?:already )?(?:seen|watched|opened)(?: ones| before| already)?\b/, 'is:seen', 'already opened'],
  [/\b(?:ai[- ]?generated|generated|made by (?:an )?ai|ai[- ]made|ai art|ai created|created by (?:an )?ai)\b/, 'in:generated', 'AI generated'],
  [/\b(?:ai[- ]?edited|ai[- ]?enhanced|enhanced|upscaled)\b/, 'in:edited', 'AI edited'],
  [/\b(?:ai[- ]?sourced|sourced(?: by ai)?|found by ai)\b/, 'in:sourced', 'AI sourced'],
  [/\b(?:ai[- ]?provided|provided(?: by ai)?)\b/, 'in:provided', 'AI provided'],
  [/\b(?:a ?i)(?: stuff| content| media| ones| files)?\b/, 'is:ai', 'AI'],
  [/\b(?:gifs?|loops?|animations?|animated)\b/, 'is:gif', 'GIFs'],
  [/\b(?:videos?|clips?|movies?|films?|footage)\b/, 'kind:video', 'videos'],
  [/\b(?:photos?|pictures?|pics?|images?|stills?|snaps?|photographs?)\b/, 'kind:image', 'photos'],
  [/\b(?:audio|songs?|music|tracks?|recordings?|voice notes?)\b/, 'kind:audio', 'audio'],
  [/\b(?:favou?rites?|favs?|faves|starred|liked|loved)\b/, 'is:fav', 'favourites'],
  [/\b(?:vertical|portrait|upright)\b/, 'is:vertical', 'vertical'],
  [/\b(?:4k|uhd|ultra hd)\b/, 'q:4k', '4K'], [/\b(?:1080p?|full hd|fhd)\b/, 'q:1080', '1080p'], [/\b720p?\b/, 'q:720', '720p'],
  [/\b(?:hd|high (?:def(?:inition)?|quality|res(?:olution)?)|good quality)\b/, 'is:hd', 'HD'],
  [/\b(?:on (?:this|my) (?:device|phone)|offline|local(?:ly)?|downloaded|stored here|playable here)\b/, 'is:local', 'on this device'],
  [/\b(?:from |on |in )?(?:google )?drive\b/, 'src:drive', 'from Drive'],
  [/\b(?:online|remote|streaming|web links?|from the web|on the web)\b/, 'is:remote', 'online'],
  [/\b(?:linked(?: folders?)?)\b/, 'is:linked', 'in linked folders'],
  [/\b(?:phone folders?)\b/, 'is:server', 'in phone folders'],
  [/\b(?:inbox|unfiled)\b/, 'is:inbox', 'in the inbox'],
  [/\b(?:my (?:own )?(?:files|uploads)|(?:that )?i added|added by me|uploaded)\b/, 'is:imported', 'that you added'],
  [/\b(?:with (?:a )?notes?|noted)\b/, 'has:note', 'with notes'],
  [/\b(?:top rated|highest rated|best rated|rated)\b/, 'is:rated', 'rated', 'rating'],
  [/\b(?:duplicates?|dupes?|exact copies)\b/, 'is:dupe', 'duplicates'],
  [/\b(?:in (?:a |any )?collections?|collected)\b/, 'is:collected', 'in collections'],
  [/\b(?:in (?:the )?)?(?:trash|bin|deleted)\b/, 'is:trash', 'in the trash'],
  [/\b(?:archived)\b/, 'is:archived', 'archived'],
  [/\b(?:newest|latest|most recent|recently added|fresh|just added|new ones|new)\b/, '', 'newest first', 'added'],
  [/\b(?:most (?:watched|opened|viewed|played)|popular|played (?:the )?most)\b/, '', 'most opened first', 'opens'],
  [/\b(?:a to z|a-z|alphabetical(?:ly)?|by name)\b/, '', 'A to Z', 'title'],
  [/\b(?:biggest|largest|highest resolution|by resolution|sharpest)\b/, '', 'sharpest first', 'res']
];
const STOP = new Set('show me find search for look looking some any all the a an my of with that are is please can you could i want wanna to see watch play open view display give get bring up pull lets just only ones one stuff things thing items item content media files file everything library from in on and or by about like something those these them it this kind type called named there have has got been our your more list browse every where which what whose ones'.split(' '));
let _srcNames = null, _srcV = -1;
function knownSources() { if (_srcNames && _srcV === LIBV) return _srcNames; _srcV = LIBV; _srcNames = Array.from(new Set(everything().map(i => srcShort(i.source).toLowerCase()).filter(Boolean))); return _srcNames; }
function knownCategory(phrase) { const p = phrase.toLowerCase().trim(); if (p.length < 3) return ''; const c = Array.from(new Set(everything().map(i => i.category).filter(Boolean))).find(c => c.toLowerCase() === p); return c || ''; }
const stem = w => w.length > 4 && /[^s]s$/.test(w) ? w.slice(0, -1) : w;
function toQuery(x) {
  let s = ' ' + String(x || '').toLowerCase() + ' ';
  const tokens = [], labels = [], words = []; let sort = '';
  const cat = knownCategory(x.replace(/^(?:the|my) /, '')); if (cat) return { q: '"' + cat.toLowerCase() + '"', tokens: [], labels: ['in ' + cat], words: [], sort: '', label: cat, cat };
  s = s.replace(/\b(?:tagged|with (?:the )?tag) ([\w-]+)/g, (_, t) => { tokens.push('tag:' + t); labels.push('tagged ' + t); return ' '; });
  s = s.replace(/\b(?:in|from) (?:the |my )?(?:collection|playlist) ([\w -]+?)(?= |$)/g, (_, c) => { tokens.push('col:' + c.trim().split(' ')[0]); labels.push('in ' + c.trim()); return ' '; });
  const vocabPass = list => list.forEach(([re, tok, lab, srt]) => { const g = new RegExp(re.source, 'g'); if (g.test(s)) { s = s.replace(g, ' '); if (tok && !tokens.includes(tok)) tokens.push(tok); if (lab && !labels.includes(lab)) labels.push(lab); if (srt) sort = srt; } });
  vocabPass(VOCAB.slice(0, 3));                         // "not seen yet", "no sound" before the general "not …"
  s = s.replace(/\b(?:without|except|excluding|but not|not|no|minus) ([a-z0-9][\w-]*)/g, (m0, w) => {
    const hit = VOCAB.find(v => v[1] && v[0].test(' ' + w + ' ')); if (hit && hit[1].startsWith('-')) return m0;
    if (hit) { tokens.push('-' + hit[1]); labels.push('not ' + hit[2]); } else { tokens.push('-' + stem(w)); labels.push('without “' + w + '”'); }
    return ' ';
  });
  vocabPass(VOCAB.slice(3));
  s = s.replace(/\bfrom ([a-z0-9][\w.-]*)/g, (m0, w) => { const k = knownSources().find(n => n.startsWith(w) || n.replace(/[^a-z0-9]/g, '') === w.replace(/[^a-z0-9]/g, '')); if (k) { tokens.push('src:' + w); labels.push('from ' + w); return ' '; } return m0; });
  s.split(/\s+/).forEach(w => { w = w.replace(/[^\w'-]/g, ''); if (w && !STOP.has(w) && w.length > 1) words.push(stem(w)); });
  const q = tokens.concat(words).join(' ');
  const kinds = labels.filter(l => /^(videos|photos|GIFs|audio|favourites|duplicates)$/.test(l)), rest = labels.filter(l => !kinds.includes(l));
  const label = (kinds.join(' and ') || 'items') + (rest.length ? ' ' + rest.join(', ') : '') + (words.length ? ' matching “' + words.join(' ') + '”' : '');
  return { q, tokens, labels, words, sort, label };
}
const CONTENTISH = new Set(['type/photos', 'type/videos', 'type/gifs', 'type/audio', 'type/vertical', 'type/hd', 'smart/fav', 'smart/unseen', 'smart/recent', 'smart/rated', 'smart/notes', 'smart/dupes']);
function exactFolder(x) {
  const raw = x.toLowerCase().trim(), n = normName(x);
  if (FOLDER_WORDS[raw]) return FOLDER_WORDS[raw]; if (FOLDER_WORDS[n]) return FOLDER_WORDS[n];
  const f = resolveFolder(x); if (!f) return null;
  return normName(folderName(f)) === n || (f.startsWith('lk:') && normName(folderName(f)) === n) ? f : null;
}
const keepCase = (raw, v) => { if (!v) return v; const i = String(raw).toLowerCase().indexOf(v); return i >= 0 ? String(raw).substr(i, v.length) : v; };   // names keep the capitals you used
function interpret(raw) {
  const c0 = interpret_(raw);
  if (['newfolder', 'newcol', 'collect', 'file', 'savesearch', 'note', 'profile'].includes(c0.t) && c0.v) c0.v = keepCase(raw, c0.v);
  return c0;
}
function interpret_(raw) {
  const t = normCmd(raw); if (!t) return { t: 'none' };
  if (/[a-z]+:\S/.test(t) || /^[-"]/.test(t)) return { t: 'search', q: String(raw).trim() };            // already search language
  let c = null;
  for (const [re, fn] of CMD_RULES) { const m = re.exec(t); if (m) { c = fn(m); if (c && !(c.t === 'seek' && !isFinite(c.d)) && !(c.t === 'seekto' && !isFinite(c.s)) && !(c.t === 'speed' && c.v != null && !isFinite(c.v)) && !(c.t === 'rate' && !isFinite(c.n))) break; c = null; } }
  if (c && c.t !== 'pre') return c;
  const how = c ? c.how : 'bare', x = c ? c.x.trim() : t;
  if (how === 'open') { if (/^(?:vault|phone snapshot)$/.test(x)) return { t: 'folder', f: 'idx/vault' }; const f = resolveFolder(x); if (f) return { t: 'folder', f }; const cat = knownCategory(x); if (cat) return { t: 'cat', cat }; }
  if (how === 'show' || how === 'bare' || how === 'play' || how === 'scroll' || how === 'shuffle') {
    const f = exactFolder(x);
    if (f && (how === 'play' || how === 'scroll' || how === 'shuffle')) return { t: 'playfolder', f, how };
    if (f && !CONTENTISH.has(f)) return { t: 'folder', f, bare: how === 'bare' };
    const cat = how === 'bare' || how === 'show' ? knownCategory(x) : ''; if (cat && how !== 'bare') return { t: 'cat', cat };
  }
  const qy = toQuery(x);
  if (how === 'bare' && !qy.tokens.length && !qy.sort && !qy.cat) return { t: 'search', q: String(raw).trim() };
  return Object.assign({ t: 'show', how: how === 'bare' || how === 'open' ? 'show' : how, bare: how === 'bare' }, qy);
}
function describe(c) {
  const names = { help: 'What can I say?', undo: 'Undo the last change', close: 'Close', play: 'Play', pause: 'Pause', stop: 'Stop', next: 'Next', prev: 'Previous', restart: 'Start over', full: 'Full screen', pip: 'Picture-in-picture', slideshow: 'Slideshow', frame: 'Save this frame', panic: 'Hide the screen now', trash: 'Move to Trash', restore: 'Restore from Trash', archive: 'Archive', unarchive: 'Unarchive', details: 'Details', copylink: 'Copy the app link', shuffle: 'Surprise me', scroll: 'Scroll through this', master: 'Export the library to a real folder', deselect: 'Stop selecting', lockctl: 'Lock the controls', share: 'Share: put a copy in your Shared folder', unshare: 'Remove from Shared', keep: 'Save to my library', pack: 'Make a share pack', importpack: 'Import a share pack', connectshared: 'Connect or sync a shared folder' };
  if (names[c.t]) return names[c.t];
  switch (c.t) {
    case 'listen': return c.on ? 'Keep listening (hands-free)' : 'Stop listening';
    case 'tab': return 'Go to ' + (c.tab === 'library' ? 'Home' : 'Tools');
    case 'seek': return (c.d < 0 ? 'Back ' : 'Forward ') + Math.abs(c.d) + ' s';
    case 'seekto': return 'Jump to ' + fmtTime(c.s);
    case 'speed': return c.v ? 'Speed ' + c.v + '×' : c.d > 0 ? 'Faster' : 'Slower';
    case 'loop': return c.on ? 'Loop on' : 'Loop off';
    case 'mute': return c.on ? 'Mute' : 'Unmute';
    case 'vol': return c.d > 0 ? 'Louder' : 'Quieter';
    case 'sleep': return c.v === '0' ? 'Sleep timer off' : c.v === 'end' ? 'Sleep at the end' : 'Sleep in ' + c.v + ' min';
    case 'zoom': return c.d > 0 ? 'Zoom in' : c.d < 0 ? 'Zoom out' : 'Reset zoom';
    case 'rotate': return 'Rotate ' + (c.dir < 0 ? 'left' : 'right');
    case 'blur': return c.on == null ? 'Toggle blur' : c.on ? 'Blur on' : 'Blur off';
    case 'theme': return c.v[0].toUpperCase() + c.v.slice(1) + ' theme';
    case 'fav': return c.on ? 'Star this' : 'Unstar this';
    case 'rate': return 'Rate ' + c.n + '★';
    case 'tag': return 'Tag: ' + c.v;
    case 'note': return 'Note: ' + c.v;
    case 'file': { const f = resolveFolder(c.v); return 'File in ' + (f ? pathOf(f).slice(1).map(p => p.name).join(' › ') : '“' + c.v + '” (new folder)'); }
    case 'collect': return 'Add to collection “' + c.v + '”';
    case 'newfolder': return 'New folder “' + c.v + '”';
    case 'newcol': return 'New collection “' + c.v + '”';
    case 'select': return c.all ? 'Select all' : 'Select';
    case 'savesearch': return 'Save this search' + (c.v ? ' as “' + c.v + '”' : '');
    case 'add': return { files: 'Add photos, videos or audio', folder: 'Add a whole folder (copy)', link: 'Link a folder (read in place)', camera: 'Camera', url: 'Save a link', paste: 'Paste', catalog: 'Import a catalog file', server: 'Load phone folders' }[c.v];
    case 'tool': return { verify: 'Verify originals', dupes: 'Find duplicates', backup: 'Export backup', selftest: 'Run self-test', copydiag: 'Copy diagnostics (no titles or notes)', rpnow: 'Make a restore point', rplist: 'Restore points', nvlock: 'Lock encrypted notes', nvunlock: 'Unlock encrypted notes', nvall: 'Encrypt all notes', nvthis: 'Encrypt this note', where: 'Where are my files?', kit: 'Download the companion kit', kitview: 'Show the companion kit files' }[c.v];
    case 'web': return 'Search the web for “' + c.v + '”';
    case 'profile': return c.v ? 'Your Shared name: ' + c.v : 'Choose your Shared name';
    case 'folder': return 'Open ' + pathOf(c.f).slice(1).map(p => p.name).join(' › ');
    case 'playfolder': return (c.how === 'scroll' ? 'Scroll ' : c.how === 'shuffle' ? 'Shuffle ' : 'Play ') + folderName(c.f);
    case 'cat': return 'Show category: ' + c.cat;
    case 'show': return (c.how === 'play' ? 'Play ' : c.how === 'scroll' ? 'Scroll ' : c.how === 'shuffle' ? 'Shuffle ' : 'Show ') + c.label + (c.q ? '   ' + c.q : '');
    case 'search': return 'Search: ' + c.q;
  }
  return 'Run';
}
/* ---------- run ---------- */
let LAST_UNDO = null;
const targetIds = () => V.open && V.item ? [V.item.id] : FEED.open && feedItem() ? [feedItem().id] : SEL.on && SEL.ids.size ? Array.from(SEL.ids) : [];
const mediaEl = () => V.open && V.vid ? V.vid : FEED.open ? feedVid() : null;
function queryList(q, sort) { const p = parseQuery(q); return sortList((wantsHidden(p) ? everything() : shown()).filter(it => matchesQuery(it, p)), sort || prefs.sort); }
function leaveOverlays() { if (V.open) closeViewer(); if (FEED.open) closeFeed(); closeSheet(); if (PAL.open) closePalette(); }
function showContent(c) {
  let q = c.q, list = queryList(q, c.sort), note = '';
  if (!list.length && c.words && c.words.length > 1) { const alt = c.tokens.concat([c.words.join('|')]).join(' '), l2 = queryList(alt, c.sort); if (l2.length) { q = alt; list = l2; note = 'Nothing has all of those words, so here is anything with one of them. '; } }
  if (!list.length && c.words && c.words.length && c.tokens.length) { const l3 = queryList(c.tokens.join(' '), c.sort); if (l3.length) note = 'No ' + c.label + '. '; }
  if (c.how === 'play' || c.how === 'shuffle') {
    let pl = list.filter(hasLocal); if (!pl.length) { if (!list.length) return note + 'Nothing matches ' + c.label; leaveOverlays(); setTab('library'); state.filter = 'all'; setQuery(q); return 'Those are online only, so here they are'; }
    if (c.how === 'shuffle') pl = pl.slice().sort(() => Math.random() - 0.5);
    leaveOverlays(); openViewer(pl[0].id, pl); return note + 'Playing ' + pl.length + ' ' + c.label.replace(/^items /, '');
  }
  if (c.how === 'scroll') { if (!list.length) return note + 'Nothing matches ' + c.label; leaveOverlays(); openFeed(list, list[0].id, c.label); return 'Scrolling ' + list.length + ' ' + c.label.replace(/^items /, ''); }
  leaveOverlays(); setTab('library'); state.filter = 'all'; state.cat = state.col = null;
  if (c.sort) { prefs.sort = c.sort; savePrefs(); $('#sort').value = c.sort; }
  setQuery(q);
  return note + (list.length ? 'Showing ' + list.length + ' ' + c.label.replace(/^items /, '') : 'Nothing matches ' + c.label);
}
function playFolder(f, how) {
  const list = folderItems(f); if (!list.length) return folderName(f) + ' is empty';
  leaveOverlays();
  if (how === 'scroll') { openFeed(list, list[0].id, folderName(f)); return 'Scrolling ' + folderName(f); }
  let pl = list.filter(hasLocal); if (!pl.length) { openFolder(f); return 'Those are online only'; }
  if (how === 'shuffle') pl = pl.slice().sort(() => Math.random() - 0.5);
  openViewer(pl[0].id, pl); return 'Playing ' + folderName(f);
}
function needTarget() { return 'Open an item first, or select some'; }
function runCommand(raw, from) {
  const c = interpret(raw); let r = '';
  try { r = execCmd(c, raw, from) || ''; } catch (e) { r = 'That did not work: ' + e.message; }
  if (r) { if (from === 'voice') { voicePill('done', r); say(r); } else toast(r); }
  return { c, reply: r };
}
function execCmd(c, raw, from) {
  const m = mediaEl(), ids = targetIds();
  switch (c.t) {
    case 'none': return '';
    case 'help': commandsSheet(); return from === 'voice' ? 'Here is what you can say' : '';
    case 'listen': if (c.on) { startVoice(true); return 'Hands-free on. Say “hub” and a command'; } stopVoice(); return 'Stopped listening';
    case 'undo': if (LAST_UNDO) { const u = LAST_UNDO; LAST_UNDO = null; u(); refreshViews(); return 'Undone'; } return 'Nothing to undo';
    case 'close': if ($('#sheet').classList.contains('open')) { closeSheet(); return ''; } if (V.open) { closeViewer(); return ''; } if (FEED.open) { closeFeed(); return ''; } if (SEL.on) { exitSelect(); return ''; } if (state.tab === 'folders' && state.folder !== 'root') { openFolder(parentOf(state.folder)); return ''; } return '';
    case 'tab': leaveOverlays(); setTab(c.tab); return c.tab === 'library' ? 'Home' : 'Tools';
    case 'play': if (m) { m.paused && m.play().catch(() => { }); return ''; } if (V.open && V.list.some(isLocalImage)) { startSlideshow(); return 'Slideshow'; } { const l = (state.tab === 'folders' ? $('#fgrid')._list : state.list || []).filter(hasLocal); if (l && l.length) { leaveOverlays(); openViewer(l[0].id, l); return 'Playing ' + l[0].title; } } shuffle(); return '';
    case 'pause': if (m) { m.pause(); return ''; } if (V.slide) { stopSlideshow(); return 'Slideshow paused'; } return 'Nothing is playing';
    case 'stop': if (m) { m.pause(); try { m.currentTime = 0; } catch (e) { } return 'Stopped'; } stopSlideshow(); return 'Nothing is playing';
    case 'next': if (V.open) { step(1); return ''; } if (FEED.open) { feedGo(1); return ''; } return 'Open something first';
    case 'prev': if (V.open) { step(-1); return ''; } if (FEED.open) { feedGo(-1); return ''; } return 'Open something first';
    case 'restart': if (m) { m.currentTime = 0; m.play().catch(() => { }); return 'From the start'; } return 'Nothing is playing';
    case 'seek': if (m) { m.currentTime = clamp(m.currentTime + c.d, 0, m.duration || 1e9); return (c.d < 0 ? 'Back ' : 'Forward ') + Math.abs(c.d) + ' s'; } return 'Nothing is playing';
    case 'seekto': if (m) { m.currentTime = clamp(c.s, 0, m.duration || 1e9); return 'At ' + fmtTime(c.s); } return 'Nothing is playing';
    case 'speed': {
      if (!m) return 'Nothing is playing';
      const cur = m.playbackRate || 1, i = SPEEDS.indexOf(cur), v = c.v ? clamp(c.v, 0.25, 4) : SPEEDS[clamp((i < 0 ? 2 : i) + c.d, 0, SPEEDS.length - 1)];
      m.playbackRate = v; if (V.open) { prefs.speed = v; savePrefs(); const s = $('#tSpeed'); if (s && SPEEDS.includes(v)) s.value = String(v); } return v + '×';
    }
    case 'loop': if (m) { m.loop = c.on; const b = $('#tLoop'); if (b && V.open) b.setAttribute('aria-pressed', c.on); return c.on ? 'Looping' : 'Loop off'; } return 'Nothing is playing';
    case 'mute': if (FEED.open && !V.open) { if (prefs.feedSound === c.on) $('#feedSound').click(); return c.on ? 'Muted' : 'Sound on'; } if (m) { m.muted = c.on; const b = $('#tMute'); if (b) b.setAttribute('aria-pressed', c.on); return c.on ? 'Muted' : 'Sound on'; } return 'Nothing is playing';
    case 'vol': if (m) { m.muted = false; m.volume = clamp(m.volume + c.d, 0, 1); return 'Volume ' + Math.round(m.volume * 100) + '%'; } return 'Nothing is playing';
    case 'full': if (V.open && V.vid) { toggleTheatre(); return ''; } if (V.open || FEED.open) { const el = V.open ? vEl() : $('#feed'); if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); else if (el.requestFullscreen) el.requestFullscreen().catch(() => { }); return ''; } return 'Open something first';
    case 'pip': if (V.open && V.vid) { pip(); return ''; } if (m && m.requestPictureInPicture) { m.requestPictureInPicture().catch(() => toast('Picture-in-picture is not available here')); return ''; } return 'Play a video first';
    case 'slideshow': if (V.open) { startSlideshow(); return 'Slideshow'; } { const l = (state.list || []).filter(isLocalImage); if (l.length) { leaveOverlays(); openViewer(l[0].id, l); setTimeout(startSlideshow, 300); return 'Slideshow of ' + l.length + ' photos'; } } return 'No photos to show';
    case 'frame': if (V.open && V.vid) { saveFrame(); return ''; } return 'Open a video first';
    case 'sleep': if (!V.open || !V.vid) return 'Open a video first'; setSleep(c.v); return c.v === '0' ? 'Sleep timer off' : c.v === 'end' ? 'I will stop at the end' : 'Sleeping in ' + c.v + ' minutes';
    case 'zoom': if (V.open && V.img) { const r = stageEl().getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, c.d === 0 ? 1 : clamp(V.z.s * (c.d > 0 ? 1.6 : 1 / 1.6), 1, 8)); return ''; } return 'Open a photo first';
    case 'rotate': if (!V.open) return 'Open something first'; { const a = adjOf(V.item.id); a.r = ((a.r || 0) + c.dir + 360) % 360; user.adj[V.item.id] = a; saveUser(); applyAdj(); return 'Rotated'; }
    case 'lockctl': if (V.open) { toggleLockCtl(); return ''; } return 'Open something first';
    case 'panic': panic(); return '';
    case 'blur': prefs.blur = c.on == null ? !prefs.blur : c.on; savePrefs(); applyPrefs(); return prefs.blur ? 'Blur on' : 'Blur off';
    case 'theme': prefs.theme = c.v; savePrefs(); applyPrefs(); if (state.tab === 'tools') renderTools(); return describe(c);
    case 'fav': {
      if (!ids.length) return needTarget();
      ids.forEach(id => { if (c.on) user.fav[id] = user.fav[id] || Date.now(); else delete user.fav[id]; }); saveUser();
      if (V.open) syncFavBtn(); if (FEED.open) { const it = feedItem(), s = $('#fscroll').children[FEED.idx], b = s && $('[data-f="fav"]', s); if (b && it) { b.textContent = isFav(it.id) ? '★' : '☆'; b.setAttribute('aria-pressed', isFav(it.id)); } }
      if (SEL.on) exitSelect(); if (!V.open && !FEED.open) refreshViews(); return (c.on ? 'Starred' : 'Unstarred') + (ids.length > 1 ? ' ' + ids.length : '');
    }
    case 'rate': { if (!ids.length) return needTarget(); const n = Math.round(clamp(c.n, 0, 5)); ids.forEach(id => { if (n) user.rating[id] = n; else delete user.rating[id]; }); saveUser(); return n ? 'Rated ' + n + ' star' + (n > 1 ? 's' : '') : 'Rating cleared'; }
    case 'tag': { if (!ids.length) return needTarget(); const v = c.v.split(/,| and /).map(s => s.trim().toLowerCase()).filter(Boolean); ids.forEach(id => { user.tags[id] = Array.from(new Set((user.tags[id] || []).concat(v))); invalidateHay(id); }); changed(); return 'Tagged ' + v.join(', '); }
    case 'note': { if (ids.length !== 1) return ids.length ? 'Notes go on one item at a time' : needTarget(); const id = ids[0]; if (wantsEnc(id)) { if (!nvUnlocked()) { nvEnsure(() => noteCommand(id, c.v)); return 'Unlock your notes first'; } noteCommand(id, c.v); return ''; } user.note[id] = ((user.note[id] ? user.note[id] + '\n' : '') + c.v).slice(0, 4000); invalidateHay(id); saveUser(); return 'Note saved'; }
    case 'file': {
      if (!ids.length) return needTarget();
      let f = resolveFolder(c.v);
      if (f === 'smart/fav') return execCmd({ t: 'fav', on: true }, raw, from);
      if (f === 'shared' || (f && f.startsWith('sh:'))) return execCmd({ t: 'share' }, raw, from);
      if (f && f.startsWith('col:')) return execCmd({ t: 'collect', v: folderName(f) }, raw, from);
      if (f && f === 'trash') return execCmd({ t: 'trash' }, raw, from);
      if (f && f === 'archive') return execCmd({ t: 'archive' }, raw, from);
      if (f && !canFile(f)) return 'You can file into AI, Sources or your own folders. ' + folderName(f) + ' fills itself';
      let made = false; if (!f) { f = createFolder(c.v.replace(/^(?:a|the|my) /, ''), 'my'); made = true; }
      const where = setHome(ids, f, true); const prevMade = made ? f : null;
      LAST_UNDO = () => { ids.forEach(id => delete user.home[id]); if (prevMade && !Object.values(user.home).includes(prevMade)) delete user.folders[prevMade]; changed(); };
      if (V.open) syncViewerFolder(); if (SEL.on) exitSelect();
      toast((made ? 'New folder, and filed in ' : 'Filed in ') + where, { label: 'Undo', fn: () => { if (LAST_UNDO) { LAST_UNDO(); LAST_UNDO = null; refreshViews(); } } });
      return from === 'voice' ? (made ? 'Made a new folder, ' : 'Filed in ') + folderName(f) : '';
    }
    case 'collect': {
      if (!ids.length) return needTarget();
      const name = c.v.replace(/^(?:a|the|my) /, ''), e = Object.entries(user.collections || {}).find(([, x]) => normName(x.name) === normName(name)) || Object.entries(user.collections || {}).find(([, x]) => normName(x.name).startsWith(normName(name)) && normName(name).length >= 3);
      if (!e) { const f = resolveFolder(name); if (f && isMy(f)) return execCmd({ t: 'file', v: name }, raw, from); }
      const cid = e ? e[0] : createCollection(name), col = user.collections[cid]; let n = 0; ids.forEach(id => { if (!col.ids.includes(id)) { col.ids.push(id); n++; } }); changed();
      LAST_UNDO = () => { col.ids = col.ids.filter(id => !ids.includes(id)); if (!e && !col.ids.length) delete user.collections[cid]; changed(); };
      if (SEL.on) exitSelect(); if (!V.open && !FEED.open) refreshViews();
      return (e ? 'Added to ' : 'New collection, added to ') + col.name;
    }
    case 'newfolder': {
      let parent = 'my'; if (c.parent) { const p = resolveFolder(c.parent); if (p && (isMy(p) || p === 'my')) parent = p; } else if (state.tab === 'folders' && isMy(state.folder)) parent = state.folder;
      const id = createFolder(c.v, parent); LAST_UNDO = () => { delete user.folders[id]; changed(); };
      if (!V.open && !FEED.open) { if (state.tab === 'folders') renderFolders(); else openFolder(parent); }
      return 'Folder “' + folderName(id) + '” ready';
    }
    case 'newcol': { const cid = createCollection(c.v); LAST_UNDO = () => { delete user.collections[cid]; changed(); }; if (ids.length) user.collections[cid].ids.push(...ids); changed(); refreshViews(); return 'Collection “' + c.v + '” ready' + (ids.length ? ' with ' + ids.length + ' item' + (ids.length > 1 ? 's' : '') : ''); }
    case 'trash': if (!ids.length) { leaveOverlays(); openFolder('trash'); return 'Opened Trash'; } trashItems(ids); LAST_UNDO = () => { ids.forEach(id => delete user.trash[id]); changed(); }; return from === 'voice' ? 'Moved to Trash' : '';
    case 'restore': { const t = ids.length ? ids : (state.tab === 'folders' && state.folder === 'trash' ? folderItems('trash').map(i => i.id) : []); if (!t.length) return 'Open the Trash folder, then say “restore”'; restoreItems(t); return from === 'voice' ? 'Restored' : ''; }
    case 'archive': if (!ids.length) return needTarget(); archiveItems(ids); LAST_UNDO = () => { ids.forEach(id => delete user.archive[id]); changed(); }; return from === 'voice' ? 'Archived' : '';
    case 'unarchive': if (!ids.length) return needTarget(); unarchiveItems(ids); return from === 'voice' ? 'Unarchived' : '';
    case 'select': leaveOverlays(); if (state.tab !== 'library' && state.tab !== 'folders') setTab('library'); startSelect(); if (c.all) selAct('all'); return SEL.ids.size ? SEL.ids.size + ' selected' : 'Tap items to select them';
    case 'deselect': exitSelect(); return '';
    case 'details': { const it = ids.length === 1 ? byId.get(ids[0]) : null; if (!it) return needTarget(); itemSheet(it); return ''; }
    case 'copylink': { const it = ids.length === 1 ? byId.get(ids[0]) : null; const link = it ? appLink(it) : appBase() + (state.tab === 'folders' ? '?folder=' + encodeURIComponent(state.folder) : ''); copyText(link).then(ok => toast(ok ? 'Link copied' : 'Copy failed')); return ''; }
    case 'savesearch': { if (!state.q.trim()) return 'Search for something first'; const sid = 's' + Date.now().toString(36); user.saved[sid] = { name: (c.v || state.q).slice(0, 60), q: state.q, created: Date.now() }; changed(); LAST_UNDO = () => { delete user.saved[sid]; changed(); }; return 'Saved as “' + user.saved[sid].name + '”. Find it in Folders › Smart folders'; }
    case 'add': return addVia(c, from);
    case 'share': { const priv = ids.filter(id => byId.get(id) && !byId.get(id).shared); if (!priv.length) return ids.length ? 'That is already in Shared' : needTarget(); shareItems(priv); return from === 'voice' ? 'Sharing a copy' : ''; }
    case 'unshare': {
      let t = ids.filter(id => byId.get(id) && byId.get(id).shared);
      if (!t.length) t = sharedHeld.filter(x => x.owner && x.owner.uid === PROFILE.uid && ids.includes(x.fromId)).map(x => x.id);      // said while looking at your private original
      if (!t.length) return ids.length ? 'That isn’t shared' : needTarget(); removeShared(t); return '';
    }
    case 'keep': { const t = ids.filter(id => byId.get(id) && byId.get(id).shared); if (!t.length) return 'Open something from Shared first'; saveSharedToLibrary(t); return ''; }
    case 'pack': exportSharePack(); return '';
    case 'importpack': if (from !== 'voice') { $('#packPick').click(); return ''; } toast('Tap to continue', { label: 'Choose pack', fn: () => $('#packPick').click() }); return 'Tap Choose pack to continue';
    case 'connectshared': if (SH.folder) { syncSharedFolder().then(n => toast('Shared folder synced: ' + n + ' items from other people')); return ''; } if (from !== 'voice') { connectSharedFolder(); return ''; } toast('Tap to continue', { label: 'Choose folder', fn: connectSharedFolder }); return 'Tap Choose folder to continue';
    case 'profile': if (!c.v) { profileSheet(); return ''; } { const v = c.v.trim().slice(0, 40); PROFILE.name = v; if (!PROFILE.uid) PROFILE.uid = randHex(8); sharedHeld.forEach(it => { if (it.owner && it.owner.uid === PROFILE.uid) { it.owner.name = v; it.source = 'Shared by ' + v; } }); saveProfile(); saveHeld(); reindex(); refreshViews(); return 'Your Shared name is ' + v; }
    case 'master': leaveOverlays(); masterSheet(); return '';
    case 'tool':
      if (c.v === 'where') { leaveOverlays(); whereSheet(); return ''; }
      if (c.v === 'verify') { leaveOverlays(); setTab('tools'); verifyAll(); return 'Checking every original'; }
      if (c.v === 'dupes') { leaveOverlays(); showDupes(); return ''; }
      if (c.v === 'backup') { exportBackup(); return ''; }
      if (c.v === 'selftest') { leaveOverlays(); setTab('tools'); selfTest(); return 'Running the self-test'; }
      if (c.v === 'kit') { downloadKit(); return ''; }
      if (c.v === 'kitview') { leaveOverlays(); viewKit(); return ''; }
      if (c.v === 'copydiag') { copyDiagnostics(); return ''; }
      if (c.v === 'rpnow') { makeRestorePoint('Saved by you', { force: true }).then(rp => toast(rp ? 'Restore point saved' : 'Could not save a restore point here')); return ''; }
      if (c.v === 'rplist') { leaveOverlays(); setTab('tools'); setTimeout(() => { const e = $('#cardRestore'); if (e) e.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60); return from === 'voice' ? 'Here are your restore points' : ''; }
      if (c.v === 'nvlock') { nvLock(true); return NV.vault ? 'Encrypted notes locked' : 'No notes passphrase is set'; }
      if (c.v === 'nvunlock') { if (!NV.vault) return 'No notes passphrase yet. Say “encrypt notes” to set one'; nvEnsure(() => toast('Notes unlocked')); return ''; }
      if (c.v === 'nvall') { nvEnsure(encryptAllNotes); return ''; }
      if (c.v === 'nvthis') { if (ids.length !== 1) return ids.length ? 'One note at a time' : needTarget(); const id = ids[0]; if (isEnc(id)) return 'That note is already encrypted'; if (!user.note[id]) { nvEnsure(() => { prefs.encNotes = true; savePrefs(); toast('New notes will be encrypted'); }); return ''; } nvEnsure(async () => { await setNote(id, user.note[id], true); toast('Note encrypted'); }); return ''; }
      return '';
    case 'web': webSheet(c.v); return from === 'voice' ? 'Pick a search engine' : '';
    case 'shuffle': leaveOverlays(); shuffle(); return '';
    case 'scroll': {
      if (FEED.open) return '';
      const l = V.open ? V.list : state.tab === 'folders' ? ($('#fgrid')._list || []) : state.list; const list = l && l.length ? l : shown();
      const start = V.open && V.item ? V.item.id : list[0] && list[0].id; leaveOverlays(); openFeed(list, start, state.tab === 'folders' ? folderName(state.folder) : state.q ? '“' + state.q + '”' : 'Everything'); return '';
    }
    case 'folder': leaveOverlays(); openFolder(c.f); { const n = SECTION_ONLY.has(c.f) ? null : rawFolderItems(c.f).length; return 'Opened ' + folderName(c.f) + (n != null ? ', ' + n + ' item' + (n === 1 ? '' : 's') : ''); }
    case 'playfolder': return playFolder(c.f, c.how);
    case 'cat': leaveOverlays(); setTab('library'); state.filter = 'cat'; state.cat = c.cat; state.col = null; setQuery(''); return 'Showing ' + c.cat;
    case 'show': return showContent(c);
    case 'search': leaveOverlays(); if (state.tab !== 'library' && state.tab !== 'folders') setTab('library'); setQuery(c.q); { const n = (state.tab === 'folders' ? $('#fgrid')._list : state.list || []).length; return from === 'voice' ? (n ? n + ' match' + (n === 1 ? '' : 'es') + ' for ' + c.q : 'No matches for ' + c.q) : ''; }
  }
  return '';
}
function addVia(c, from) {
  const gesture = from !== 'voice';                     // file pickers need a tap; voice offers a button instead
  const home = state.tab === 'folders' && canFile(state.folder) ? state.folder : '';
  const viaTap = (label, fn) => { if (gesture) { fn(); return ''; } toast('Tap to continue', { label, fn }); return 'Tap ' + label + ' to continue'; };
  if (c.v === 'files') return viaTap('Choose files', () => { ADD.home = home; $('#filePick').click(); });
  if (c.v === 'folder') return viaTap('Choose folder', () => { ADD.home = home; $('#folderPick').click(); });
  if (c.v === 'link') return viaTap('Link folder', () => linkFolder(home));
  if (c.v === 'camera') return viaTap('Open camera', () => { ADD.home = home || 'src/device'; $('#camPick').click(); });
  if (c.v === 'catalog') return viaTap('Choose file', () => $('#catalogPick').click());
  if (c.v === 'paste') return viaTap('Paste', pasteFromClipboard);
  if (c.v === 'server') { loadServerLibrary(false); return ''; }
  if (c.v === 'url') { leaveOverlays(); addLinkSheet({ url: firstUrl(c.url) }); return ''; }
  return '';
}
/* ---------- help & web search sheets ---------- */
const SAY = [
  ['Find & show', ['show me unseen videos', 'videos from drive not gifs', 'newest photos', 'favourites', 'show me vertical clips in hd', 'beach videos', 'tagged slow-mo']],
  ['Folders', ['open generated', 'open the ai folder', 'go to inbox', 'open trash', 'new folder trips', 'where are my files']],
  ['Play & control', ['play favourites', 'scroll unseen videos', 'surprise me', 'pause', 'next', 'skip 30 seconds', 'go to 1:30', 'faster', 'speed 1.5', 'loop', 'mute', 'full screen', 'sleep in 20 minutes']],
  ['Organise (the item in view, or your selection)', ['favourite this', 'rate this 5', 'file this in sourced', 'move this to trips', 'add this to keepers', 'tag this as close-up', 'note: best angle at the end', 'archive this', 'delete this', 'undo']],
  ['Add', ['add files', 'link a folder', 'take a photo', 'save link', 'paste', 'load phone folders', 'export library to a folder']],
  ['Safety', ['make a restore point', 'restore points', 'encrypt notes', 'encrypt this note', 'lock notes', 'unlock notes', 'copy diagnostics', 'back up']],
  ['Shared (the only place for other people)', ['share this', 'open shared', 'open my shared folder', 'make a share pack', 'import share pack', 'unshare this', 'save this to my library', 'my name is …']],
  ['Privacy, look & voice', ['hide', 'blur off', 'dark mode', 'keep listening', 'stop listening', 'search the web for …']]
];
function commandsSheet() {
  openSheet(`<h2>What you can say or type</h2><p style="color:var(--muted);margin:2px 0 8px;font-size:.86rem">Tap the mic and talk, hold it for hands-free, or type in Quick actions (K). Tap any example to try it. Commands run on this device.</p>` +
    SAY.map(([h, xs]) => `<div class="sect"><div class="sect-h">${esc(h)}</div><div class="taglist">${xs.map(x => `<button class="tag say" data-say="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>`).join('') +
    `<p style="color:var(--muted);font-size:.8rem;margin-top:14px">Content requests become search terms you can see in the search box, for example “unseen videos from drive” → <code>is:unseen kind:video src:drive</code>. In hands-free mode, start with “hub”, e.g. “hub, next”.</p>`);
  $$('#sheetBody [data-say]').forEach(b => b.onclick = () => { const v = b.dataset.say; if (/…$/.test(v)) { closeSheet(); openPalette(); $('#palQ').value = v.replace(/…$/, ''); renderPal($('#palQ').value); return; } closeSheet(); runCommand(v, 'typed'); });
}
const ENGINES = [['DuckDuckGo', 'https://duckduckgo.com/?q='], ['Google', 'https://www.google.com/search?q='], ['Bing', 'https://www.bing.com/search?q='], ['Brave', 'https://search.brave.com/search?q='], ['Google Images', 'https://www.google.com/search?tbm=isch&q='], ['Your Google Drive', 'https://drive.google.com/drive/search?q=']];
function webSheet(q) {
  if (prefs.offlineOnly) return toast('Offline-only mode is on, so web search is off. Turn it off in Tools › Privacy & network.');
  q = String(q || '').trim().slice(0, 300);
  openSheet(`<h2>Search the web</h2><p style="color:var(--muted);margin:2px 0 10px;font-size:.86rem">Opens in your browser. Nothing is sent until you tap a search engine.</p>
    <div style="display:flex;gap:8px"><input class="input" id="webQ" value="${esc(q)}" placeholder="What to look for"></div>
    <div class="taglist" id="webEng" style="margin-top:12px">${ENGINES.map(([n]) => `<a class="btn small" data-eng="${esc(n)}" target="_blank" rel="noopener noreferrer" href="#">${esc(n)}</a>`).join('')}</div>
    <p style="color:var(--muted);font-size:.8rem;margin-top:12px">Found something to keep? Copy its link and say “save link”, or use + › A link.</p>`);
  const upd = () => { const v = $('#webQ').value.trim(); $$('#webEng [data-eng]').forEach(a => { const e = ENGINES.find(x => x[0] === a.dataset.eng); a.href = e[1] + encodeURIComponent(v); }); };
  $('#webQ').oninput = upd; upd();
}
/* ---------- voice: one-shot, hands-free with a wake word, spoken replies, on-device when the browser offers it ---------- */
const VOICE = { rec: null, on: false, hands: false, restartT: 0, speaking: false, SR: window.SpeechRecognition || window.webkitSpeechRecognition || null };
const WAKE = /^(?:(?:hey|ok|okay|hi) )?(?:media )?hub\b[ ,.:!-]*/i;
/* We use the browser's normal speech service and never request on-device mode: in current Chromium builds,
   SpeechRecognition.available() and processLocally together with a language setting can crash the tab. */
function startVoice(hands) {
  if (prefs.offlineOnly) { toast('Offline-only mode is on, so voice is off (the browser’s speech service is online). Type the command instead, in the search box or Quick actions.'); return; }
  if (!VOICE.SR) { toast('Voice needs Chrome, Edge or Safari. You can type the same commands in Quick actions (K).'); return; }
  if (VOICE.on) { if (hands && !VOICE.hands) { VOICE.hands = true; stopRec(); syncVoiceUi(); voicePill('listening', 'Hands-free: say “hub” then a command'); return; } stopVoice(); return; }
  VOICE.on = true; VOICE.hands = !!hands; listen();
}
function stopRec() { if (VOICE.rec) { try { VOICE.rec.abort(); } catch (e) { } } }
async function listen() {
  if (!VOICE.on) return;
  let r; try { r = new VOICE.SR(); } catch (e) { VOICE.on = false; syncVoiceUi(); toast('Voice is not available right now'); return; }
  const lang = prefs.voiceLang || navigator.language || 'en-US';
  r.lang = lang; r.interimResults = true; r.continuous = VOICE.hands; r.maxAlternatives = 4;

  r.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) heard(Array.from(res).map(a => String(a.transcript || '').trim()).filter(Boolean)); else interim += res[0].transcript; }
    if (interim) voicePill('listening', interim);
  };
  r.onerror = e => {
    const er = e.error;
    if (er === 'not-allowed' || er === 'service-not-allowed') { stopVoice(); toast('The microphone is blocked for this page. Allow it in the browser’s site settings, then try again.'); }
    else if (er === 'network') { stopVoice(); toast('This browser’s voice recognition needs a connection right now. Every command also works typed in Quick actions (K).'); }
    else if (er === 'language-not-supported') { stopVoice(); toast('Voice does not support ' + lang + ' here. Change the language in Tools › Voice.'); }
    else if (er === 'no-speech' && !VOICE.hands) voicePill('idle', 'Didn’t catch that. Tap the mic and try again.');
  };
  r.onend = () => { VOICE.rec = null; if (VOICE.on && VOICE.hands) { if (!VOICE.speaking) VOICE.restartT = setTimeout(listen, 250); } else { VOICE.on = false; syncVoiceUi(); setTimeout(() => { if (!VOICE.on) voicePill('', ''); }, 2600); } };
  VOICE.rec = r;
  try { r.start(); } catch (e) { VOICE.on = false; syncVoiceUi(); toast('Voice could not start: ' + e.message); return; }
  syncVoiceUi(); voicePill('listening', VOICE.hands ? (prefs.voiceWake ? 'Hands-free: say “hub” then a command' : 'Hands-free: listening') : 'Listening…');
}
function stopVoice() { VOICE.on = false; VOICE.hands = false; clearTimeout(VOICE.restartT); stopRec(); VOICE.rec = null; syncVoiceUi(); voicePill('', ''); try { speechSynthesis.cancel(); } catch (e) { } }
function heard(alts) {
  if (!alts.length) return;
  if (/^(?:(?:hey |ok )?hub )?(?:stop|end) listening\b/i.test(alts[0])) { stopVoice(); toast('Stopped listening'); return; }
  let list = alts;
  if (VOICE.hands && prefs.voiceWake) { const w = alts.filter(a => WAKE.test(a)); if (!w.length) { voicePill('ignored', '“' + alts[0] + '”  ·  say “hub” first'); return; } list = w.map(a => a.replace(WAKE, '')).filter(Boolean); if (!list.length) { voicePill('listening', 'Yes?'); return; } }
  let pick = list[0]; for (const a of list) { const c = interpret(a); if (c.t !== 'search' && c.t !== 'none') { pick = a; break; } }
  voicePill('heard', pick); runCommand(pick, 'voice');
}
function say(text) {
  if (!prefs.voiceReply || !('speechSynthesis' in window) || !text) return;
  try {
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(String(text).replace(/[“”]/g, '').slice(0, 160)); u.lang = prefs.voiceLang || navigator.language || 'en-US'; u.rate = 1.05;
    if (VOICE.hands && VOICE.rec) { VOICE.speaking = true; stopRec(); }
    u.onend = u.onerror = () => { if (VOICE.speaking) { VOICE.speaking = false; if (VOICE.on && VOICE.hands) listen(); } };
    speechSynthesis.speak(u);
  } catch (e) { VOICE.speaking = false; }
}
let pillT = 0;
function voicePill(kind, text) {
  const p = $('#vpill'); clearTimeout(pillT);
  if (!kind) { if (VOICE.on) return; p.className = 'vpill'; return; }
  p.className = 'vpill on ' + kind; $('#vpillText').textContent = text; $('#vpillStop').classList.toggle('hidden', !VOICE.on);
  $('#vpillMode').textContent = VOICE.hands ? 'Hands-free' : VOICE.on ? 'Listening' : kind === 'done' ? 'Done' : 'Voice';
  if (kind === 'done' || kind === 'ignored' || kind === 'idle') pillT = setTimeout(() => { if (VOICE.on) voicePill('listening', VOICE.hands ? 'Hands-free: say “hub” then a command' : 'Listening…'); else p.className = 'vpill'; }, kind === 'done' ? 2600 : 2000);
}
function syncVoiceUi() { const b = $('#btnMic'); if (!b) return; b.classList.toggle('live', VOICE.on); b.classList.toggle('hands', VOICE.on && VOICE.hands); b.setAttribute('aria-pressed', VOICE.on); b.setAttribute('aria-label', VOICE.on ? 'Stop listening' : 'Voice commands (hold for hands-free)'); }
function bindVoice() {
  const b = $('#btnMic'); let holdT = 0, held = false;
  if (!VOICE.SR) b.classList.add('nosr');
  b.addEventListener('pointerdown', () => { held = false; clearTimeout(holdT); holdT = setTimeout(() => { held = true; if (navigator.vibrate) navigator.vibrate(12); startVoice(true); }, 550); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(holdT)));
  b.addEventListener('click', e => { e.preventDefault(); if (held) { held = false; return; } if (!VOICE.SR) return commandsSheet(); startVoice(false); });
  b.addEventListener('contextmenu', e => e.preventDefault());
  $('#vpillStop').onclick = stopVoice; $('#vpillHelp').onclick = commandsSheet;
}
function renderVoiceCard() {
  const el = $('#voiceInfo'); if (!el) return;
  $('#optVoiceReply').checked = !!prefs.voiceReply; $('#optVoiceWake').checked = !!prefs.voiceWake; $('#optVoiceLang').value = prefs.voiceLang || '';
  if (!VOICE.SR) { el.textContent = 'This browser has no speech recognition. Every command still works typed into Quick actions (K) or the search box (press Enter).'; return; }
  el.textContent = 'Speech is turned into text by the browser’s own speech service (in Chrome that is Google’s, so it needs a connection). Only the words are used; Media Hub itself sends nothing anywhere, and every command also works typed.';
}
