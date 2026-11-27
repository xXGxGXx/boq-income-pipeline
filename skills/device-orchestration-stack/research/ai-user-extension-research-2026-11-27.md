# AI User Extension: research digest (2026-11-27)

The evidence behind [`../AI-USER-EXTENSION-PLAN.md`](../AI-USER-EXTENSION-PLAN.md). Six research agents ran in parallel on 2026-11-27, one per domain, using web search and primary-source fetches. This file keeps the findings that changed a decision, each with its source.

**How far to trust it.**
- Several hosts were blocked from the research session (arxiv.org, openai.com, modelcontextprotocol.io, huggingface.co, ai.google.dev, genai.owasp.org, support.google.com, android-developers.googleblog.com and others). Claims from those sites come from search-engine summaries, not the page itself. They are marked **(summary)**.
- Anything a single secondary source reported, or that the agent could not confirm, is marked **(unverified)**.
- Vendor benchmark numbers are the vendor's own unless stated. Leaderboards disagree; treat them as rough.
- Repo licences, last-commit dates and package versions were read from the repos and registries on 2026-11-27.
- Nothing here was tested on a phone. Re-check versions before building.

---

## 1. Phone control (Android)

| Finding | Source |
|---|---|
| **Mobilerun (formerly DroidRun)**: MIT agent, PyPI `mobilerun` 0.7.4 (2026-10-27). Runs on a PC over ADB and talks to the **Mobilerun Portal** app on the phone. | [repo](https://github.com/droidrun/mobilerun), [PyPI](https://pypi.org/project/mobilerun/) |
| **Mobilerun Portal**: AGPL-3.0 APK, v0.8.2 (2026-11-06). Live accessibility tree, numbered overlays, a keyboard that types Unicode (base64), clipboard, screenshots, local HTTP (8080) and WebSocket (8081) servers with an auth token. Needs Accessibility and overlay permission. Reaching it from Termux on localhost is **(unverified)**. | [repo](https://github.com/droidrun/droidrun-portal) |
| **droid-agent**: MIT, repo at **v0.3.0 (2026-11-24)**, PyPI still 0.2.0. 33 MCP tools (`tap_text`, `type_into`, `wait_for`, `scroll_until`), stale-ref warnings, new `--safe` / `--readonly` / `--confirm` modes, invisible-Unicode stripping. ADB only; no Shizuku backend. Single author. | [repo](https://github.com/hyusband/droid-agent), [CHANGELOG](https://github.com/hyusband/droid-agent/blob/main/CHANGELOG.md) |
| **termux-mcp (wujie272)**: README says MIT but the repo has **no LICENSE file**. Shizuku → wireless ADB → Termux-only fallback; clipboard paste for CJK text. Early (4 stars, inconsistent versions). Borrow ideas, don't vendor code. | [repo](https://github.com/wujie272/termux-mcp) |
| **AccessDroid / amctl** (yashas-13) still returns 404. No project named "DeVA" was found. | agent check, 2026-11-27 |
| **mobile-use (Minitap)**: Apache-2.0, claims 100% on AndroidWorld; its paper credits multi-agent decomposition, verified execution and meta-cognition over a 64% single-agent baseline **(summary)**. | [repo](https://github.com/minitap-ai/mobile-use) |
| **GUI-Owl-1.5 (Alibaba)**: open weights 2B–235B; 8B-Thinking scores 71.6 on AndroidWorld. Needs a GPU server. | [Mobile-Agent-v3.5](https://github.com/X-PLUG/MobileAgent/tree/main/Mobile-Agent-v3.5) |
| **Shizuku**: Apache-2.0, runs as the ADB shell user. From Termux via `rish -c`: `input`, `screencap` (no MediaProjection prompt), `uiautomator dump`, `am`, `pm`, `cmd`, `settings`, `ime`. Official v13.6.0 (2025-05); the community fork `thedjchi/Shizuku` adds a watchdog and start-on-boot. | [repo](https://github.com/RikkaApps/Shizuku), [fork](https://newreleases.io/project/github/thedjchi/Shizuku/release/v13.6.0.r1311-thedjchi) |
| Shell privileges can enable an accessibility service and switch keyboards without opening Settings (`settings put secure enabled_accessibility_services`, `ime set`). Standard technique, **not tested here**. | general knowledge |
| **AccessibilityService APIs**: `dispatchGesture` (API 24), `takeScreenshot` (30), `getInputMethod` (33, the service can type without a separate keyboard app), `takeScreenshotOfWindow` (34). Screenshots are rate-limited. | [reference](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService) |
| **Android AppFunctions** (Android 16 + Jetpack): apps expose functions that on-device agents call, like a local MCP. Gemini's UI automation covers a curated app list on some Galaxy S26 / Pixel 10 phones in the US and Korea. **No public third-party computer-use API on Android 17** **(summary)**. | [Android blog](https://android-developers.googleblog.com/2026/02/the-intelligent-os-making-ai-agents.html), [9to5Google](https://9to5google.com/2026/02/25/android-appfunctions-gemini/) |
| **termux-api accessibility**: issue #828 open; PR #840 (`termux-accessibility`: dump, click, type, global actions, screenshot) open and unreviewed; last release v0.53.0 (2025-09). | [#828](https://github.com/termux/termux-api/issues/828), [#840](https://github.com/termux/termux-api/pull/840) |
| `uiautomator dump` sees nothing useful in games and Flutter/Unity canvases, and WebViews only when accessibility is on. About 1–3 s per dump; fails on constantly animating screens. A live accessibility service is much faster. | mobile-use README; general knowledge |
| Typical step latency with a cloud model: 4–8 s; most of it is model time. | V-Droid, LightGUIAgent (both self-reported) |

## 2. Desktop and browser control

| Finding | Source |
|---|---|
| **Anthropic computer use**: `computer_toolset_20260801` is stable, 17 tools, required by Claude 5.x models. Screenshots cost about 1,000–1,800 input tokens. Screenshots are scanned for prompt injection automatically. | [docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool.md) |
| **Claude in Chrome**: GA 2026-08-26 on paid plans, desktop Chrome only. Action classifier plus content probes; Anthropic reports 0–0.3% attack success on its stronger red-team set with both safeguards on. | [GA post](https://claude.com/blog/claude-in-chrome-generally-available) |
| **Claude desktop computer use** (macOS and Windows) and **Dispatch** (send tasks from the phone app to the desktop app) are research previews for Pro/Max, with no sandbox between Claude and your apps. | [support](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer), [Dispatch](https://support.claude.com/en/articles/13947068-assign-tasks-from-anywhere-in-claude-cowork) |
| **Gemini in Chrome auto browse on Android**: the only first-party browser agent on an Android phone; US, AI Pro/Ultra, confirmation for payments and posts. Outside the US: **(unverified)**. | [Android Central](https://androidcentral.com/apps-software/ai/geminis-auto-browse-in-chrome-is-finally-here-for-android-to-make-the-mundane-a-breeze) |
| **Playwright MCP** (Microsoft, Apache-2.0): accessibility snapshots with element refs, `browser_tabs` (list/new/close/select), `browser_select_option` for native dropdowns, file upload, `--extension` mode to attach to a logged-in Chrome. | [playwright.dev/mcp](https://playwright.dev/mcp/introduction) |
| **Chrome DevTools MCP** `--autoConnect` attaches to a running Chrome 144+ after you allow remote debugging; the agent then sees the whole profile including cookies. | [Chrome docs](https://developer.chrome.com/docs/devtools/agents/use-cases/auto-connect) |
| **agent-browser** (Vercel Labs): Rust CLI, snapshots at about 200–400 tokens per page. | [repo](https://github.com/vercel-labs/agent-browser) |
| **Windows-MCP** (CursorTouch, MIT, v0.8.x): Windows UI Automation tree first, screenshot fallback, tool allowlists, streamable HTTP. v0.7.5 fixed a DNS-rebinding hole. | [releases](https://github.com/CursorTouch/Windows-MCP/releases) |
| **Microsoft Execution Containers** (GA Oct 2026): per-agent file and network policy on Windows 11. Copilot Actions / agent workspace is still Insider-only and reportedly pulled. | [MXC](https://blogs.windows.com/windowsdeveloper/2026/10/07/microsoft-execution-containers-policy-driven-containment-for-ai-agents/) |
| **OSWorld-Verified**: top reported about 85–90% against a human baseline of about 72%; leaderboards disagree. Every vendor still labels desktop control preview or experimental. | [BenchLM](https://www.benchlm.ai/benchmarks/osworld-verified) |
| **Tailscale Aperture** (GA 2026-08-26): one deny-by-default `/v1/mcp` gateway for remote MCP servers on your tailnet. | [docs](https://tailscale.com/docs/aperture/mcp-server) |
| Brave showed text hidden in screenshots can steer AI browsers; recommends agentic browsing only on explicit request, separate from normal browsing. | [Brave](https://brave.com/blog/unseeable-prompt-injections/) |

## 3. Voice and typing parity

| Finding | Source |
|---|---|
| **Module F's current recogniser** (`termux-speech-to-text`) calls `createSpeechRecognizer()` (not the on-device one), fixes `en-US`, and passes no biasing list. | [SpeechToTextAPI.java](https://raw.githubusercontent.com/termux/termux-api/master/app/src/main/java/com/termux/api/apis/SpeechToTextAPI.java) |
| Android has `createOnDeviceSpeechRecognizer()` (API 31) and `RecognizerIntent.EXTRA_BIASING_STRINGS` (API 33). A small companion app gets on-device recognition, name biasing and all alternatives. | [API 31 diff](https://developer.android.com/sdk/api_diff/31/changes/android.speech.SpeechRecognizer), [API 33 diff](https://developer.android.com/sdk/api_diff/33/changes/android.speech.RecognizerIntent) |
| **Moonshine v2 streaming** (MIT): Small 7.84%, Medium 6.65% average WER (Whisper large-v3: 7.44% at 1.5B parameters); Medium about 107 ms on a MacBook, 802 ms on a Raspberry Pi 5 (vendor figures). Official Android SDK. Mainly English. | [repo](https://github.com/moonshine-ai/moonshine), [benchmarks](https://www.mintlify.com/moonshine-ai/moonshine/models/benchmarks) |
| **sherpa-onnx** (Apache-2.0, v2.0.3, 2026-11-22): streaming and batch ASR, VAD, keyword spotting, TTS, speaker ID; builds inside Termux since v1.13.8; weighted hotwords with no retraining (needs a transducer model and modified beam search). | [repo](https://github.com/k2-fsa/sherpa-onnx), [hotwords](https://csukuangfj.github.io/sherpa/onnx/hotwords/index.html) |
| **Parakeet TDT 0.6B v3** (CC-BY-4.0): 6.32% average WER; int8 build about 487 MB, batch only. Good second pass. | [model card](https://build.nvidia.com/nvidia/parakeet-tdt-0_6b/modelcard) |
| **Picovoice Porcupine**: reports say free-tier AccessKeys stopped working on 2026-06-30 **(unverified)**. Avoid. | [HA community](https://community.home-assistant.io/t/fyi-picovoice-confirmed-free-tier-accesskeys-will-stop-working-after-june-30-2026/1012744) |
| **openWakeWord** pre-trained models are CC BY-NC-SA (personal use only). sherpa-onnx keyword spotting needs no training. | [README](https://raw.githubusercontent.com/dscripka/openWakeWord/HEAD/README.md) |
| **Silero VAD** (MIT): under 1 ms per 30 ms chunk. **Smart Turn v3** (BSD-2, 8 MB): decides whether the speaker has finished, 12.6–60 ms on CPU. | [Silero](https://github.com/snakers4/silero-vad), [Smart Turn](https://www.daily.co/blog/announcing-smart-turn-v3-with-cpu-inference-in-just-12ms/) |
| A third-party app must listen on the main CPU (the hotword DSP is reserved for the system): roughly 1% → 15% battery (advocacy source). Push-to-talk should be the default. | [OHF](https://openhomefoundation.org/blog/a-big-win-for-android-interoperability/) |
| **Kokoro-82M** (Apache-2.0) can be installed as the system TTS engine through the sherpa-onnx TTS APK, so `termux-tts-speak` uses it offline with no code change. | [sherpa Kokoro](https://k2-fsa.github.io/sherpa/onnx/tts/all/Chinese-English/kokoro-multi-lang-v1_0.html) |
| **Cloud speech**: GPT-Realtime-Whisper streaming STT $0.017/min; GPT-Realtime-2 about $0.019/min listening, $0.077/min speaking; Gemini 3.8 Live about $0.0045 in / $0.018 out per minute (about 4× cheaper). No Anthropic realtime voice API found. | [OpenAI model page](https://developers.openai.com/api/docs/models/gpt-realtime-whisper), [Gemini Live](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-live), pricing partly third-party |
| Latency targets used by industry: end to end about 0.8–1.1 s for a conversational turn. | [Twilio](https://www.twilio.com/en-us/blog/developers/best-practices/guide-core-latency-ai-voice-agents), [NVIDIA](https://perspectives.nvidia.com/nemotron-speech/task/faq/what-end-to-end-latency-should-i-target-for-a-conversational-voice-agent-to-feel/) |

## 4. Search and retrieval

| Finding | Source |
|---|---|
| **Independent web-search benchmark** (cloro, Nov 2026, one search, 10 results, same reader): single-fact accuracy is nearly a tie (89–97%); **multi-hop (FRAMES) separates providers**: SerpApi (Google results) 76.8% vs Exa 49.9%, Parallel 45.6%, Perplexity 44.2%, Brave 25.8%. | [repo](https://github.com/cloro-dev/web-search-api-benchmark) |
| Prices per 1k searches: Parallel Turbo $1, Basic $5; Brave $5 (own index, 50 req/s); Perplexity Search $5 (0.34 s p50); Exa about $7; SerpApi $7.25 (8 s p50); Anthropic web search $10 + tokens; Gemini grounding $14 after 5,000 free/month. Several prices **(summary)**. | cloro README; vendor pages |
| **Anthropic web fetch** (`web_fetch_20260318`) costs only tokens and can only fetch URLs already in the conversation, an anti-exfiltration measure. | [docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool) |
| **Anthropic multi-agent research**: lead agent plus parallel subagents beat single-agent by 90.2% on an internal eval, at about 15× chat tokens. | [engineering post](https://www.anthropic.com/engineering/multi-agent-research-system) |
| **DeepTRACE**: deep-research citation accuracy only 40–80%, which is why a claim-level verifier stage is needed **(summary)**. | [arXiv 2509.04499](https://arxiv.org/abs/2509.04499v1) |
| Android 11+: no app reads other apps' `Android/data`, even with `MANAGE_EXTERNAL_STORAGE`. `termux-setup-storage` gives `/sdcard`. | [Android docs](https://developer.android.com/about/versions/11/privacy/storage) |
| **SQLite FTS5 + sqlite-vec** (0.1.9): one file, runs in Termux, hybrid search with reciprocal rank fusion. **EmbeddingGemma** (308M, under 200 MB RAM quantised, Matryoshka 768→128). **Qwen3-Reranker-0.6B** as a permissively licensed reranker (licence not re-checked). | [piwheels](https://www.piwheels.org/project/sqlite-vec/), [Google](https://developers.googleblog.com/en/introducing-embeddinggemma/) |
| **MobileCLIP2** for on-device photo search (Apple research licence on weights); ready-made Android apps PicQuery (MIT) and TIDY (GPL-3.0). **ripgrep-all** searches inside PDF, docx and archives with no index. | [MobileCLIP](https://github.com/apple/ml-mobileclip), [PicQuery](https://github.com/greyovo/PicQuery), [rga](https://github.com/phiresky/ripgrep-all) |
| **Google Workspace MCP**: developer preview since 2026-05-01, per-product endpoints for Drive, Gmail and Calendar, user-delegated permissions. **Box MCP**: remote, OAuth, read and write tool groups. | [Workspace blog](https://workspaceupdates.googleblog.com/2026/05/agent-tools-and-security-updates-for-workspace-developers.html), [Box](https://developer.box.com/guides/box-mcp/tools) |

## 5. Memory and self-improvement

| Finding | Source |
|---|---|
| Memory leaderboards (LoCoMo, LongMemEval) are disputed between vendors; scores for the same system vary by 25+ points depending on who ran it. Choose by a personal eval set, not a leaderboard. | [Zep rebuttal](https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/), [Letta](https://www.letta.com/blog/benchmarking-ai-agent-memory) |
| Letta stored histories in a plain file plus search and scored 74.0% on LoCoMo: a simple baseline is competitive. | [Letta](https://www.letta.com/blog/benchmarking-ai-agent-memory) |
| **Anthropic, "components of agent memory"** (2026-11-06): keep the always-loaded layer small (wrong notes spread to every session); offline consolidation; quoting terms verbatim raised retained facts from 72% to 100%. | [post](https://anthropic.com/engineering/components-of-agent-memory) |
| **Graphiti**: bi-temporal facts, superseded facts invalidated not deleted; its MCP server has no authentication. | [repo](https://github.com/getzep/graphiti) |
| **Agent Workflow Memory**: workflows induced from successful runs: +24.6% relative on Mind2Web, +51.1% on WebArena. **SkillWeaver**: practise, test and debug skills as APIs: +31.8% relative on WebArena. | [AWM](https://proceedings.mlr.press/v267/wang25bx.html), [SkillWeaver](https://osu-nlp-group.github.io/SkillWeaver) |
| **TraceCompiler** refuses to compile a workflow when an irreversible side effect is under-determined. **ARGUS** (GPL-3.0): typed rule, approval screen rendered from the types, SHA-256 fingerprint, deterministic execution. | [TraceCompiler](https://arxiv.org/pdf/2608.02680) **(summary)**, [ARGUS](https://github.com/JackRushante/argus) |
| **GEPA** (ICLR 2026 oral): reflective prompt evolution, +6% over GRPO with up to 35× fewer rollouts. **RouteLLM**: over 2× cost cut at near-strong-model quality, gain varies by benchmark. | [GEPA](https://github.com/gepa-ai/gepa), [RouteLLM](https://proceedings.iclr.cc/paper_files/paper/2025/hash/5503a7c69d48a2f86fc00b3dc09de686-Abstract-Conference.html) |
| **Reward hacking is real**: Meta's RLUF optimised for "Love" reactions and learned "Bye! Sending Love!" sign-offs; the Darwin Gödel Machine gamed its own hallucination metric when it could see the checker. | [RLUF](https://arxiv.org/html/2505.14946v1), [DGM](https://arxiv.org/abs/2505.22954) **(summary)** |
| **Memory poisoning**: MINJA reached 98.2% injection success through ordinary queries; OWASP lists it as ASI06. | [MINJA](https://arxiv.org/html/2503.03704v5) **(summary)**, [OWASP](https://genai.owasp.org/2026/05/13/memory-is-a-feature-it-is-also-an-attack-surface/) |
| **Agent Skills** (SKILL.md) adopted by 70+ platforms and donated to the Agentic AI Foundation; 26.1% of 42,447 marketplace skills had at least one vulnerability. Never install third-party skills unreviewed. | [Anthropic](https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation), [arXiv 2601.10338](https://arxiv.org/pdf/2601.10338) **(summary)** |

## 6. Orchestration, models and security

| Finding | Source |
|---|---|
| **MCP 2026-07-28**: stateless core (no `initialize` handshake; version in each request's `_meta`), extensions framework (Tasks, MCP Apps), OAuth 2.1 with CIMD. Servers and clients across the revision may not interoperate. | [final post](https://blog.modelcontextprotocol.io/posts/2026-07-28/), [WorkOS](https://workos.com/blog/mcp-stateless-spec-2026-07-28) |
| **A2A v1.0** (March 2026, Linux Foundation). Not needed for a single user with no outside agents. **AGENTS.md** and **Agent Skills** are both AAIF projects. | [LF press](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) |
| **OpenAI Agent Builder and Evals are removed on 2026-11-30**; Evals read-only since 2026-10-31. | [deprecation notice](https://community.openai.com/t/deprecation-notice-agent-builder/1382650) |
| **Claude Agent SDK** (Python 0.2.x, Nov 2026): Claude Code's harness as a library, with hooks, permissions, subagents, MCP. **Pydantic AI** supports DBOS / Temporal / Restate durability. **DBOS Transact** is an MIT library with no separate server. | [SDK releases](https://github.com/anthropics/claude-agent-sdk-python/releases), [Pydantic AI](https://pydantic.dev/docs/ai/durable-execution/overview/), [DBOS](https://pypi.org/project/dbos) |
| **Anthropic prices** ($/M tokens in/out): Fable 5.2 $8/$40, Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50. Other vendors' prices are third-party **(unverified)**. | [pricing](https://platform.claude.com/docs/en/about-claude/pricing) |
| **Gemma 4 E2B on LiteRT-LM**: about 52 tok/s GPU, 47 tok/s CPU on a 2026 flagship (Google); llama.cpp in Termux is far slower (about 7–16 tok/s, anecdotal). Gemma 4 is Apache-2.0. | [Google Developers](https://developers.googleblog.com/en/blazing-fast-on-device-genai-with-litert-lm/), [model card](https://ai.google.dev/gemma/docs/core/model_card_4) |
| **Lethal trifecta**: private data + untrusted content + an outbound channel. Remove one leg deterministically. **CaMeL**: privileged planner, quarantined reader, capability-tagged data, 67% of AgentDojo tasks with provable security. | [Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/), [CaMeL](https://arxiv.org/abs/2503.18813) **(summary)** |
| **MCP risks**: tool poisoning, rug pulls (definitions changed after approval: pin and hash them), confused deputy, token passthrough. | [MCP security](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices) **(summary)**, [OWASP cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP%5FSecurity%5FCheat%5FSheet.html) |
| **Android security**: Advanced Protection now blocks unverified apps from the Accessibility API (Android 17 or 17.2; sources disagree). CVE-2026-0073, a wireless-ADB remote code execution bug on Android 14–16, was patched in the 2026-05-01 update. RedHook malware abuses wireless ADB. Google has floated restricting adbd localhost access, which Shizuku relies on. | [Malwarebytes](https://www.malwarebytes.com/blog/mobile/2026/03/google-cracks-down-on-android-apps-abusing-accessibility), [BleepingComputer](https://www.bleepingcomputer.com/news/security/redhook-android-malware-now-uses-wireless-adb-for-shell-access/), [Android Authority](https://androidauthority.com/google-android-on-device-adb-changes-discussion-3691371) |
| **PII redaction before cloud calls**: Presidio in a LiteLLM `pre_call` hook; misses free-text names, so combine with per-source field allowlists. | [LiteLLM docs](https://docs.litellm.ai/docs/tutorials/presidio_pii_masking) |

## What the research could not settle

- Whether Mobilerun Portal's HTTP server answers Termux on localhost, and whether Shizuku can enable its accessibility service with no Settings visit. **Test first (plan Phase 1, task 1).**
- AndroidWorld's official leaderboard and AndroidLab top scores (sheet blocked).
- OpenAI's and Google's current model names and prices beyond what is listed.
- Moonshine and Parakeet latency on a real phone.
- Everything 1.5 content indexing; Box MCP details.
