# Recall Vault: portable local-first skill

Metadata-only media catalog validation with no file movement and no network dependency.

## Included
- `SKILL.md`: Shelf, Bench, Blueprint and privacy rules.
- `tools/recall_vault_check.py`: validates derivative-parent relationships and warns about unlinked client records.
- `tools/create_blueprint.py`: previews or creates empty directories only.
- `schemas/catalog.schema.json`: minimal catalog schema.
- `tests/test_recall_vault_check.py`: standard-library regression tests using synthetic records only.

## Test
```sh
python -m unittest discover -s tests -v
```

## Check a local catalog
Keep the real catalog under a local ignored `private/` directory in the host project, not in this package:
```sh
python tools/recall_vault_check.py private/recall-catalog.json
python tools/recall_vault_check.py private/recall-catalog.json --strict-links
```
Exit codes: 0 = clean (or warnings only in normal mode), 1 = validation findings, 2 = unusable input. The source catalog is never rewritten.

## Create the folder map
```sh
python tools/create_blueprint.py /path/to/RecallVault --dry-run
python tools/create_blueprint.py /path/to/RecallVault --create
```
Only directories are created. No placeholders, copies or media moves.
