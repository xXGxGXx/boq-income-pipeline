# Verified vs unverified

Research ran on 2026-11-27 with some websites blocked, so several claims rest on search summaries. Perplexity owns verifying this list (with Grok for fast-moving items and Gemini for Android ones). Record each result as `VER-YYYYMMDD-<PLATFORM>-NNN` in your THOUGHTS and summarise on the scoreboard.

## Checked in this session (by running code or reading source)

- `extension_core` tests: 82 pass. Module F tests pass. Repository integrity and privacy checks pass.
- Mobilerun Portal source: package `com.mobilerun.portal`; HTTP 8080 / WebSocket 8081 off by default and bound to all interfaces when on; ContentProvider accepts only its own uid, shell (2000) and root.
- droid-agent 0.3.0 source: all adb calls go through `Adb.run()`, `Adb.exec_out()`, `_base()`.
- Termux package recipes: Python 3.14; `python-onnxruntime`, `llama-cpp`, `ollama`, `ripgrep-all` exist; sqlite-vec has no Termux wheel; no Playwright browser for Android.
- Shizuku `rish` setup steps (from its script); the Shell package's permissions (from the AOSP manifest).

## To verify (owner: phone tests; AIs: sources)

| # | Claim | Who | How to verify |
|---|---|---|---|
| U1 | The grant script works on the owner's real phone | Owner | Run it; paste output |
| U2 | `cmd role add-role-holder android.app.role.ASSISTANT <pkg>` works from the shell on Android 14–17 | Gemini, Perplexity | AOSP source or official docs |
| U3 | What Android 17's `SHOW_WITH_ASSIST_STRUCTURE_SCREEN_CONTENT` changes | Gemini | Android 17 API reference |
| U4 | Writing `enabled_accessibility_services` from the shell bypasses Android 13–16 "restricted settings" | Gemini, Perplexity | Docs, AOSP, credible reports |
| U5 | Android 17 Advanced Protection revokes accessibility for non-accessibility-tool apps | Perplexity, Grok | Google sources |
| U6 | Google is restricting on-device ADB loopback (would break Shizuku); current status | Grok, Perplexity | Google issue tracker, Android blog, credible coverage |
| U7 | Picovoice ended free-tier AccessKeys on 2026-06-30 | Perplexity | Picovoice site |
| U8 | Moonshine v2 and Parakeet TDT latency on a 2025–26 Android phone | Perplexity | Benchmarks |
| U9 | `pip install sherpa-onnx` works in Termux (Android cp314 wheel) | Perplexity (sources), owner (phone) | PyPI files; try it |
| U10 | mcp Python SDK 2.3.0 depends on `httpx2` | Perplexity | PyPI metadata |
| U11 | Current AndroidWorld leaderboard top scores | Perplexity | Official leaderboard |
| U12 | Brave, Parallel, Exa, Perplexity Search API prices per 1,000 queries today | Perplexity | Pricing pages |
| U13 | Google Workspace MCP status (preview or GA) and scopes | Gemini, Perplexity | Google docs |
| U14 | Whether Termux's Google Play build supports `RUN_COMMAND` and Termux:Tasker | Perplexity | Termux docs and issues |
| U15 | Whether `adb install` is exempt from Google's developer verification flow | Perplexity, Gemini | Android developer blog |
| U16 | Reddit API approval requirement for new personal apps | Perplexity | Reddit help |
| U17 | Current OpenAI computer-use model name and Gemini computer-use status | Perplexity, Grok | Official docs |
| U18 | muse.ai search features, API and limits, and whether face search can be fully turned off | Muse | Muse's own docs and settings |
