# AI User Extension: steps only you can take

Everything else is scripted or done by the assistant. These need a person: Android, Google and GitHub require a human tap, a sign-in or an approval for them, by design. In order, with the reason each can't be automated. Nothing here has been run on your phone yet; if a step behaves differently on your phone, say so and the script or this list gets fixed.

**Already done for you:** the plan, the research, the Phase 0 core (`extension_core/`, 82 tests), the grant script (`bootstrap/grant_all.sh`), the source catalogue.

## A. Once, on the phone (about 20 minutes)

| # | Step | Why it can't be automated |
|---|---|---|
| A1 | Keep **Termux, Termux:API** (and any other Termux add-ons) **from the same source** (all F-Droid/GitHub, or all Google Play). Don't mix them. | Android refuses add-ons signed by a different source; only you can install or replace apps |
| A2 | Install **official Shizuku**. (The `thedjchi` fork starts itself after a reboot, but its maintenance is paused, it updates itself from GitHub, and switching resets every app's Shizuku permission. Not recommended.) | App installs need your confirmation |
| A3 | Settings → About phone → tap **Build number** 7 times (Developer options), then Developer options → **Wireless debugging** on. | Android only lets a person turn these on |
| A4 | Open Shizuku → **Pair** using the Wireless debugging pairing code, then **Start**. In Shizuku, allow **Termux**. | Pairing codes are shown only on screen, to a person |
| A5 | Shizuku → "Use Shizuku in terminal apps" → **Export** to a folder. Then in Termux: `termux-setup-storage`, `mkdir -p ~/bin && cp ~/storage/shared/<that folder>/rish* ~/bin/`, `sed -i 's/"PKG"/"com.termux"/' ~/bin/rish`, `chmod 700 ~/bin/rish && chmod 400 ~/bin/rish_shizuku.dex`, then `rish -c id` (approve Shizuku's prompt; expect `uid=2000(shell)`). Now run `bash bootstrap/grant_all.sh` to see what it will do, and `bash bootstrap/grant_all.sh --apply` to do it. | You decide when your phone's settings change; the script defaults to a dry run. The dex must be read-only or Android 14+ refuses it |
| A6 | Install the **Mobilerun Portal** APK (from its GitHub releases) when Phase 1 starts. If Android shows the "unverified developer" flow, follow it once. **Leave its HTTP and WebSocket servers off**: they listen on every network your phone joins. The assistant talks to Portal through Shizuku instead. | App installs need your confirmation |
| A7 | If the grant script says the **assistant role** was refused, set it by hand: Settings → Apps → Default apps → **Digital assistant app** → the companion app. Also leave "Use text from screen" on. | Some Android builds only allow this in Settings |
| A8 | Approve the one-time prompts the companion app shows: **add Quick Settings tile**, the first **Bubble**, and **notifications**. | Android shows these to a person only |

## B. After every phone restart

| # | Step | Why |
|---|---|---|
| B1 | Open Shizuku → **Start** (skip if you use the fork's start-on-boot, or are rooted). | Wireless debugging and Shizuku stop at reboot; restarting needs Wireless debugging, which Android ties to a person |

## C. Accounts and keys (do the ones for features you want)

Put keys in Termux's environment (for example `~/.ai-extension/env`, which is outside the repository) or the PC's environment, **never** in the repository or a chat. Names only:

| # | Step | Unlocks |
|---|---|---|
| C1 | Claude API key → `ANTHROPIC_API_KEY` | The planner and agent loops |
| C2 | **Brave Search API** sign-up (monthly free credit) → `BRAVE_SEARCH_API_KEY` | Web search |
| C3 | Google Cloud project with your own OAuth client, approve the consent screen for Drive, Gmail and Calendar (read-only first) → `GOOGLE_WORKSPACE_OAUTH` | Searching your Drive, mail and calendar |
| C4 | GitHub token, read-only first → `GITHUB_TOKEN` | Repository search |
| C5 | Optional: Parallel (`PARALLEL_API_KEY`), Gemini (`GEMINI_API_KEY`), YouTube Data (`YOUTUBE_API_KEY`), xAI (`XAI_API_KEY`, already named in the repo), OpenAlex, Podcast Index, Reddit (needs Reddit's approval) | Extra sources in `extension_core/sources.json` |
| C6 | Set a **monthly spending cap** in each provider's console | Provider-side safety net under the orchestrator's own budget gate |

## D. PC (only for PC and browser control, Phase 4)

| # | Step | Why |
|---|---|---|
| D1 | Install **Tailscale** on the phone and the PC and sign both into the same account | Sign-in is yours |
| D2 | Create a separate **Chrome profile for the agent** with no banking or password-manager logins | Only you can sign into accounts |
| D3 | Install Docker Desktop if you want **n8n** for the long tail of apps | Installer needs admin rights |

## E. Decisions and approvals

| # | Step | Why |
|---|---|---|
| E1 | Read and merge (or reject) the branch `claude/ai-user-extension-tntyy8`. Nothing has been merged to `main`. | AGENTS.md: you approve what lands |
| E2 | Approve the one-line CI change that runs `extension_core`'s tests on every push, or say no. | AGENTS.md rule 5: workflow changes need your explicit OK |
| E3 | Say yes or no to the five proposed changes in the plan's §11 (most important: stop using this public repository as a fallback for private checkpoints and sync state). | They change locked design decisions |
| E4 | Choose: Android **Advanced Protection** off (Portal works) or on (still works, more slowly). | Security trade-off on your phone |
| E5 | Build the **personal eval set**: about 50 real tasks you do (find, store, move, provide, act), each with the right answer. The assistant can draft it from your history if you allow that; you confirm each item. Kept privately, never in the repository. | Only you know what a right answer is |
| E6 | Time yourself once on 10 of those tasks. | The "better than you" baseline has to be your own |
| E7 | Each week: skim the private progress report and spot-check 10 results. | You are the final judge |

## What you never need to do

Copy code by hand, edit config files, or approve each individual action below the confirmation tier: reading, searching, opening apps, tapping, typing and other reversible steps run without asking. You are asked only before something is sent, deleted or changed for good, and the assistant never pays, transfers or touches passwords at all.
