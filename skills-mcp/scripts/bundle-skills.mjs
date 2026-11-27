// Build step: turn skills-data/ (instruction text only) into lib/skills.generated.json.
import fs from "node:fs";
import path from "node:path";
const root = path.resolve("skills-data");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const ALLOWED = /\.(md|txt|json)$/i;
const out = { generatedAt: new Date().toISOString(), skills: {} };
for (const s of manifest) {
  const files = s.files.filter(f => ALLOWED.test(f.path)).map(f => ({
    ...f, text: fs.readFileSync(path.join(root, s.name, f.path), "utf8"),
  }));
  const skill = files.find(f => f.path === "SKILL.md");
  const fm = /^---\n([\s\S]*?)\n---/.exec(skill.text);
  const desc = fm && /description:\s*"?([^\n]*?)"?\s*$/m.exec(fm[1]);
  out.skills[s.name] = {
    name: s.name, repo: s.repo, commit: s.commit, dir: s.dir, kind: s.kind,
    description: desc ? desc[1] : (skill.text.split("\n").find(l => l.trim() && !l.startsWith("#")) || "").trim(),
    files,
  };
}
fs.writeFileSync("lib/skills.generated.json", JSON.stringify(out));
console.log("bundled", Object.keys(out.skills).join(", "));
