# boq-income-pipeline

Digital product drafts, specs, and automation assets for Kyle Beskin-Clark. Public-facing index for buyers and collaborators; internal pipeline notes live in Drive.

## Products

| Product | Price | Path |
| --- | --- | --- |
| NDIS SIL Compliance Starter Pack 2.0 (workflow, 11 Word templates, evidence tracker, 11 prompts) | A$37 | `products/ndis-sil-compliance-pack/` |
| Privacy and Integrity Toolkit 1.0 (five stdlib Python tools) | A$19 | `products/privacy-integrity-toolkit/` |
| Media Hub 2.3 (private offline media library) | A$24 | `media-hub/`, `products/media-hub/` |
| AI Governance Bundle | A$49 | Tiered Memory v3.2 + Dead Man's Switch |
| Micro-Pack | A$5 | Alert-hook starter (see `gumroad/micro-pack-listing.md`) |

## Specs & Skills

- Tiered Memory System v3.2 — `skills/tiered-memory-system/v3.2.md`
- Dead Man's Switch — separate repo: https://github.com/xXGxGXx/dead-mans-switch
- Device orchestration stack — `skills/device-orchestration-stack/DESIGN.md`
- Auto-continue loop — `skills/auto-continue-loop/`
- Drive checkpoint — `skills/drive-checkpoint/`

## Landing Pages

- Dead Man's Switch: https://dead-mans-switch-landing-kylebesk1-7661.vercel.app

## Gumroad Listings

All listings are in `gumroad/`: governance bundle, micro-pack, privacy toolkit, NDIS pack and Media Hub. Build the buyer zips with `python3 products/build_releases.py --out release-out`, and the covers with `python3 products/make_covers.py --out release-out/covers`.

## License

MIT — see `LICENSE`.
