# Recall Vault Skill

## Mission
Operate a local, offline-first catalog without moving, renaming, rewriting, or deleting source media. Originals remain at their existing locations. Posters and playable derivatives are children of a catalog record; they never replace or satisfy the original.

## Shelf: metadata-only library work
Shelf may search, star, retag, import metadata, and back up catalog metadata. These operations must not relocate or rewrite original media. Keep source references as references. Never infer a missing file from a poster, thumbnail, preview, or playable.

## Bench: integrity and relationship checks
Run \`python tools/recall_vault_check.py <catalog.json>\` before and after metadata changes. The checker reads the catalog only; \`--report\` writes a separate new report and never overwrites.

A child code's parent is derived by removing **only the final hyphen-separated segment**:
- \`M1001-poster\` → \`M1001\`
- \`M1001-playable\` → \`M1001\`
- \`AI-M2001-poster\` → \`AI-M2001\`, **not** \`AI\`

The child suffix must match its role (\`-poster\` or \`-playable\`). The exact derived parent must exist exactly once as a non-child record. A poster alone never covers or replaces the original. Do not guess or silently repair a missing parent; report it for review.

Missing client links are warnings by default. Use \`--strict-links\` to make them blocking errors.

## Blueprint: folders only
Run \`python tools/create_blueprint.py <target> --dry-run\` to preview the empty folder map, or add \`--create\` to create directories. It creates directories only: no sample files, media copies, moves, or overwrites. Existing files in any target path component cause a safe refusal.

## Privacy boundary
- Keep personal catalogs, original filenames, media paths, client records, share links, manifests, archive-part names, and tokens in a local \`private/\` directory ignored by Git.
- Do not put private catalogs, client identifiers, original filenames, source links, or tokens in public commits, PRs, issues, tests, or AI prompts.
- An optional metadata bridge stays within the local machine/network boundary. Store its token in the OS credential store or an environment variable; never paste it into chat, a repository, report, or task file.
- Do not send client records, financial details, private media, or raw personal catalogs to hosted model providers. Use synthetic examples for AI-assisted tooling.
- Recall Vault has no cloud service. Do not imply that local metadata access is a cloud backup.

## Safety rules
1. Inventory and verify before changing metadata.
2. Preserve source paths and originals; no move, rename, transcode, overwrite, or delete operations.
3. Create derivative records only when their exact parent exists.
4. Keep poster and playable relationships distinct from source coverage.
5. Verify archive checksums before reconstruction. Rebuild only to a new destination and compare the whole-archive digest when available.
6. Backups contain metadata only unless the owner explicitly selects source files and a destination outside the repository.
7. Report uncertainty. Never invent a missing path or client link.

## Synthetic catalog example
\`\`\`json
{
  "version": 1,
  "items": [
    {"code": "M1001", "role": "plate"},
    {"code": "M1001-poster", "role": "poster"},
    {"code": "M1001-playable", "role": "playable"},
    {"code": "AI-M2001", "role": "loop"},
    {"code": "AI-M2001-poster", "role": "poster"},
    {"code": "CLIENT-001", "role": "client", "link": null}
  ]
}
\`\`\`
This is synthetic documentation data only. Never copy real client records into this skill package.
