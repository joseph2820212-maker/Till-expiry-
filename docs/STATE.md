# TillExpiry — build state

Single live state file (master handoff §38). Updated at every gate.

| Field | Value |
|---|---|
| Specification | TillExpiry — Claude Code Master Build Handoff v1.0 (24 Sep 2026) |
| Repository | joseph2820212-maker/Till-expiry- |
| Branch | `claude/till-expiry-app-e7267q` (the session's mandated branch; the handoff names `claude/build-till-expiry-v1`, which this session is not permitted to push to — recorded as a deviation) |
| Primary reference | TillCalc `e7ea8caadd1b2f2e663b3c8059b4102d5515adcc` (verified present; on `origin/main` and `claude/audit-repair-release1`) |
| Secondary reference | Till Note `6fa6e941ac7e94334519c435f8bae3bf9d160826` on `codex/till-note-visual-correction` (verified present, 15 Sep 2026 "Apply red-marked UI-only repairs") |
| Current gate | G0 |
| Blockers | G10 native build: `dl.google.com` (Android SDK) returns 403 through this environment's proxy; see the G10 section of `MASTER_BUILD_REPORT.md` |

## Decisions taken under §42 ("resolve routine implementation details yourself")

| # | Decision | Reason |
|---|---|---|
| D1 | Evolve the existing TillExpiry tree (TillCalc shell, via TillLabel) instead of re-copying TillCalc from scratch | The shell files are byte-identical to TillCalc `e7ea8ca` or traceable adaptations (provenance table); re-copying would reproduce them exactly |
| D2 | Billing SDK removed from the review build; every feature unlocked; "Review build" shown in About | §29 — billing must not delay the review APK; no network SDK in the review build (§34) |
| D3 | Demo data lives under its own `demo:` key namespace, adapted from Till Note's `demoAsyncStorage` redirection | §21, §27, T65–T66: demo can never read or write real keys |
| D4 | Markdown helper reimplemented in exact integer money from the idea of TillCalc `safeMarkdown.ts`, without its tax / fee pricing engine | TillExpiry keeps no tax or fee settings; the TillCalc helper depends on the locked float pricing engine |
