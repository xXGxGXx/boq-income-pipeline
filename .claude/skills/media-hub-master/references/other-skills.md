# Handing off to other skills and tools

This skill owns the library, its originals and its code. When the *output* is something else, use the tool built for it, and keep this skill's rules (originals untouched, privacy first, synthetic test media).

| Need | Use | Note for media libraries |
|---|---|---|
| A Word document, letter or report file | `docx` skill (or `docs` for an editable shared doc) | catalogs and reports: titles only if the user wants them in the document |
| A spreadsheet of the library (or reading one) | `xlsx` skill | read only the sheets you need; skip sheets tied to image-transformation bots |
| A PDF (read, fill, merge) | `pdf` skill | |
| A slide deck | `pptx` skill, or a slides artifact type | |
| Charts of library stats (counts by folder, storage) | `dataviz` skill | numbers only, no thumbnails of private media |
| A page to share (explainer, dashboard, report) | Artifact tool with `artifact-design` | never a personal library or its titles; synthetic or aggregate data only |
| Diagrams of the architecture | `artifact-diagramming` | |
| A code review of changes | `code-review` (bugs) and `simplify` (cleanups); `security-review` for the server | run before merging forks |
| Running and seeing the app | `run` skill, or Playwright directly | synthetic demo build only |
| A recurring job (nightly verify, weekly optimise) | `loop`, or scheduled tasks | keep jobs read-only unless the user asked for writes |
| Deep comparisons of tools or formats | `deep-research` | |
| The user's own browser or desktop (their Drive, their phone files) | `chrome-browser`, `built-in-browser`, `computer-use`, or attach their computer's folder | only with the user's go-ahead; never browse their private storage on a hunch |
| Claude API / Agent SDK code | `claude-api` skill | |
| Session start-up hooks, settings, permissions | `session-start-hook`, `update-config`, `fewer-permission-prompts` | |
| A new or improved skill | `skill-creator` | |

Built-in commands such as `/add-dir`, `/mcp`, `/diff`, `/export` and `/reload-skills` are typed by the user, not called as skills: suggest them when they fit.
