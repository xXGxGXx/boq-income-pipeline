# Writing files safely (from the repository's AGENTS.md)

- **Send the file's real text.** Connectors and apps don't run a shell: `$(cat file)`, `${VAR}`, backticks and `<<EOF` are saved exactly as typed. That is how a key document once became a 29-byte line three times.
- **Send whole files.** Never save a part with "rest unchanged" or "..." in place of real content.
- **Read back** after writing: size and first lines.
- **Don't overwrite** a file you haven't read in its current state.
- **Version, don't overwrite, in Drive:** new versions get a new name (`NAME-v2.md`), so nothing is lost and Drive's revision limits never bite.
- **Before any commit to the repository:** `python3 scripts/check_repo.py` and `python3 scripts/privacy_scan.py --staged` must both end clean, and the relevant tests must pass.
