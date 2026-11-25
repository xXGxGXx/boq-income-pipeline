# Vercel Hourly Sweep — vercel-auto-unlock

**Created:** 2026-11-26
**Automation:** vercel-hourly-sweep (Automations, hourly, Australia/Brisbane, notifications off)
**Team:** team_Et3tuByDa2vmsDxEIqge5WFR (kylebesk1-7661)

## Why this exists

vercel-auto-unlock (webhook-triggered) strips SSO/password protection when a Vercel deploy event arrives, but:
1. No Vercel create-webhook tool exists on the connector surface — the webhook endpoint must be registered manually in the Vercel dashboard (Team Settings > Webhooks > deployment.created).
2. New projects inherit the team's default deployment protection at creation time, before any deploy event fires.

The hourly sweep closes both gaps with zero dashboard steps.

## Behavior

- Lists ALL projects on the team (paginated).
- For each project with ssoProtection or passwordProtection non-null: vercel___update_project strips both to null.
- Re-lists and verifies zero protected projects remain.
- One-line reply: SWEEP_DONE <unlocked> unlocked, <total> projects, <failures> failures.

## Related

- Webhook automation: vercel-auto-unlock (task 4f54d9ca) — instant unlock on deploy event once dashboard webhook is pointed at it.
- Standalone response parameters: ANTI-UNVERIFIED-SPEAKING, COMPLETION-VERIFICATION-MANDATE (Tier S+).
- Vercel deploy ambiguity rule: one clean retry only on ambiguous errors.

## Open item

Register the Vercel team webhook manually (30 seconds): Team Settings > Webhooks > add endpoint = Automations webhook URL for vercel-auto-unlock, event deployment.created. After that, unlocks are instant on deploy AND hourly-swept as backup.
