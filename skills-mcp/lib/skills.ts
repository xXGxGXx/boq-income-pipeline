import data from "./skills.generated.json";

type File = { path: string; repoPath: string; size: number; gitBlobSha: string; sha256: string; text: string };
type Skill = { name: string; repo: string; commit: string; dir: string; kind: string; description: string; files: File[] };
const SKILLS = (data as unknown as { skills: Record<string, Skill> }).skills;

// The four names K asked for that have no standalone SKILL.md anywhere searched (GitHub + Drive).
// media-hub-master/SKILL.md line 8 states it folds them in, so they resolve to it with an explicit note.
const FOLDED: Record<string, string> = {
  "media-hub-local": "media-hub-master",
  "media-retriever": "media-hub-master",
  "media-vault-optimizer": "media-hub-master",
  "workspace-mirror": "media-hub-master",
};

export const SKILL_NAMES = [
  "skill-creator", "recall-vault", "media-hub-master",
  "media-hub-local", "media-retriever", "media-vault-optimizer", "workspace-mirror",
];

function src(s: Skill, f: File) {
  return `https://github.com/${s.repo}/blob/${s.commit}/${f.repoPath}`;
}

export function listSkills() {
  return SKILL_NAMES.map((n) => {
    const target = FOLDED[n] ?? n;
    const s = SKILLS[target];
    const main = s.files.find((f) => f.path === "SKILL.md")!;
    return {
      name: n,
      status: FOLDED[n] ? `folded-into:${target}` : s.kind === "upstream" ? "upstream-public" : "standalone",
      description: FOLDED[n]
        ? `No standalone SKILL.md found; its essentials live in ${target} (see that skill's references/). get_skill returns ${target}.`
        : s.description,
      source: src(s, main),
      gitBlobSha: main.gitBlobSha,
      helperFiles: s.files.filter((f) => f.path !== "SKILL.md").map((f) => f.path),
    };
  });
}

export function getSkill(name: string, includeHelpers = true): string | null {
  const target = FOLDED[name] ?? name;
  const s = SKILLS[target];
  if (!s) return null;
  const parts: string[] = [];
  if (FOLDED[name]) {
    parts.push(`> NOTE: No standalone "${name}" SKILL.md was found in K's GitHub or Google Drive. ` +
      `media-hub-master/SKILL.md says it folds in media-hub-local, media-retriever, media-vault-optimizer and workspace-mirror, ` +
      `so the full media-hub-master skill is returned below.\n`);
  }
  for (const f of s.files) {
    if (!includeHelpers && f.path !== "SKILL.md") continue;
    parts.push(`===== ${target}/${f.path} (source: ${src(s, f)}, git blob ${f.gitBlobSha}, ${f.size} bytes) =====\n${f.text}`);
  }
  return parts.join("\n\n");
}

export function getSkillFile(name: string, file: string): string | null {
  const s = SKILLS[FOLDED[name] ?? name];
  return s?.files.find((f) => f.path === file)?.text ?? null;
}
