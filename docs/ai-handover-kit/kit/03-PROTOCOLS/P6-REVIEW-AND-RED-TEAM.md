# P6 · Review and red team

Every platform names **at least three ways the current design could fail** and checks at least one part of the plan in depth.

## Where to look for flaws

- **Privacy leaks:** any path where personal data could reach a web API, a public repo, or a third-party service.
- **Single points of failure:** Shizuku dying at reboot, wireless debugging, Tailscale down, the PC off, a provider outage.
- **Platform changes:** Android restricting ADB loopback, Advanced Protection, accessibility policy, Termux build splits.
- **Prompt injection:** content on screen or in a web page steering the assistant.
- **Reward hacking in the learning loop:** the assistant optimising a metric instead of the owner's real goal.
- **Cost runaway:** loops, retries, deep research without caps.
- **Usability:** too many confirmations (owner stops using it) or too few (mistakes).
- **Unverified claims** the plan relies on (see `01-PROJECT-STATE/VERIFIED-VS-UNVERIFIED.md`).

## How to report

Use `05-TEMPLATES/ERROR-REPORT.md`. One error per report. ID `ERR-YYYYMMDD-<PLATFORM>-NNN`. Include severity (critical / high / medium / low), evidence, and a proposed fix. Add one line to `ERROR-AGGREGATOR.md`; if another platform already reported the same issue, add your ID next to theirs (consensus raises its priority).
