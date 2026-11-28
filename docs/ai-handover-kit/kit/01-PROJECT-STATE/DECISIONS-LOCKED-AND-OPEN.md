# Decisions: locked, defaulted, and open

## Locked by the owner earlier (don't re-propose without new evidence)

- Single-grant architecture (one permission surface for the whole stack).
- Module F allowlist is global, synced across devices.
- Human is final judge; Grok is the handover overseer.
- Repository rules in `AGENTS.md` (privacy scan, honesty, no merging your own change to privacy/security files or workflows without the owner's OK).

## Defaults the plan uses until the owner says otherwise

| Decision | Default |
|---|---|
| Shizuku build | Official (the `thedjchi` fork is paused, self-updates, and resets every app's grant) |
| Android Advanced Protection | Off; workable if on (the assistant still sees through the Assist API and acts through Shizuku) |
| PC | Both phone-only and phone+PC modes; PC preferred for heavy work |
| Web search keys | Brave first, Parallel second |
| Cloud extras (Base44, hosted Desktop Commander relay, realtime voice) | Off until asked; confirmation-gated when on |
| Monthly cloud budget | To be set by the owner before Phase 2 |

## Open: needs the owner

1. Merge or change the branch.
2. Approve or reject the CI line that runs the core's tests.
3. Plan §11, five proposed changes to existing documents. Most important: stop using the public repository as a fallback for private checkpoints and sync state (Module D and the Drive-checkpoint skill).
4. Advanced Protection on or off.
5. Build the personal eval set (about 50 real tasks with right answers) and time a baseline on 10.

## Open: for the AI platforms to help settle

- Whether Android 17's `SHOW_WITH_ASSIST_STRUCTURE_SCREEN_CONTENT` changes what the Assist API delivers (Gemini).
- Whether `cmd role add-role-holder android.app.role.ASSISTANT` works from the shell on current Android (Gemini).
- Best on-device speech recogniser for this phone in practice (Perplexity, Gemini).
- Whether muse.ai's search inside videos can serve the "find this moment" feature without uploading private media (Muse).
- Anything in the owner's past conversations that contradicts the plan (Grok, ChatGPT, Gemini).
