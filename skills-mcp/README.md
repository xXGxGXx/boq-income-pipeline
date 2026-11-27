# K Skills — remote MCP connector

Minimal MCP server (Streamable HTTP, `mcp-handler` 2.x on Next.js) that serves the instruction text of K's skills.

- Tools: `list_skills`, `get_skill(name, include_helpers?)`, `get_skill_file(name, path)`
- Prompts and resources: one per skill (`skill://<name>/SKILL.md`)
- Endpoint: `/api/<key>/mcp`. The key is NOT in this repo; it is the `SKILLS_MCP_KEY` env var on the Vercel project. Wrong key = 404.
- Only `.md`, `.txt`, `.json` instruction files are bundled. No media, zips, images, scripts or evals.

## Rebuild / redeploy
```bash
python3 fetch_skills.py        # (skills-data/ is not committed) pulls pinned skill text into skills-data/ (git blob SHAs printed)
npm install
vercel deploy --prod --yes     # prebuild bundles skills-data/ into lib/skills.generated.json
```
To update a skill, change the pinned commit in `fetch_skills.py` and redeploy.

## Sources
- recall-vault: `skills/recall-vault/` (this repo)
- media-hub-master: `.claude/skills/media-hub-master/` (this repo). media-hub-local, media-retriever,
  media-vault-optimizer and workspace-mirror have no standalone SKILL.md; media-hub-master says it folds them in,
  so those names resolve to it with an explicit note.
- clip-desk: `skills/clip-desk/` (this repo, branch `skills-mcp-connector`). Instructions only; the tools, library,
  catalog and rules stay on the box.
- skill-creator: upstream `anthropics/skills` `skills/skill-creator/` (Apache-2.0, LICENSE.txt bundled).

Limitation: skills that act on local files (media library, workspace mirror) only return instructions through
this connector; the Vercel function cannot reach the box's or phone's files.
