# Vercel Hourly Sweep — vercel-auto-unlock

**Created:** 2026-11-26
**Automation:** vercel-hourly-sweep (Automations, hourly, Australia/Brisbane, notifications off)
**Team:** the owner's Vercel team. Its ID and slug stay in the automation's own settings, not in this public repository (the slug contains part of the owner's email address).

## Risk: read before relying on this

Stripping `ssoProtection` and `passwordProtection` makes **every** deployment of **every** project on the team public to anyone who has or guesses the URL, including preview builds of unfinished work, and any project created later. Deployment URLs are predictable from the project name. Prefer a list of named projects that are meant to be public, and leave protection on for the rest. A project that holds private data (Media Hub builds, catalogs, anything behind a token) must never be in the sweep.

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
