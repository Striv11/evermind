# Work log

Newest entries at the bottom. Each entry records what actually changed, what was learned, and what comes next.

## 2026-10-31: Day 1 (scaffold, archive format, vault, landing)

**Changed**

- Picked the name **Evermind**; 14-day arc planned in `PLAN.md`.
- Scaffold: Vite + TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, ESLint flat config, Prettier, Playwright (desktop + mobile projects). `check.sh` runs format, lint, tsc, unit tests and a production build.
- Archive format v1: `docs/ARCHIVE_FORMAT.md`, typed schema, dependency-free validator with path-addressed issues and referential-integrity checks.
- Encrypted vault: PBKDF2-SHA256 (600k) -> 512 bits split into an AES-GCM key and a verifier; header bound as GCM AAD; fresh IV per save. Tests cover wrong passphrase, ciphertext/IV tampering, header forgery, malformed input, lock semantics.
- UI: landing, fictional demo persona ("Wren Calloway"), vault create/unlock/lock/export/delete, light/dark theme, keyboard shortcuts, skip link. 6 Playwright runs pass (3 flows x 2 viewports).
- CI, Pages workflow, README with screenshots.

**Learned**

- AES-GCM alone cannot distinguish a wrong key from tampering; a separately derived verifier solves it. Consequence: tampering with salt/iterations/check reports "wrong passphrase", which is acceptable and documented.

**Next (day 2)**: markdown/journal and Q&A importers with date extraction and a drag-and-drop UI.

**Not yet verified**: the Pages deployment itself (needs the repo pushed and Pages enabled with the "GitHub Actions" source).
