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

## 2026-10-31: Studio, audio memories, digital self (interactive session)

**Changed:** Built the user-requested flow end to end. Audio or video is uploaded or recorded and decoded to 16 kHz mono. It is transcribed on-device by Whisper (transformers.js in a worker), then segmented into memory-sized passages. Each passage gets emotion scores (lexicon with negation and intensifiers, weighted by tone of voice from energy, pitch variation and speaking rate), life areas, people and a date, and is saved encrypted in the vault. The Studio shows an emotional spectrum with filters. Section 3 clones the user's voice (ElevenLabs) and renders a talking video (D-ID) from the sharpest, best-lit frame of their video. It is gated by explicit consent and labeled as AI. Keys live in memory only.
**Schema:** `audio` source kind; optional `emotions`, `themes` and `span` on memories (backward compatible, validated, documented).
**Tests:** 42 unit tests (emotions, themes, people, dates, prosody on synthetic tones, segmentation, ingest validity, recall/abstention, service clients with mocked fetch, frame sharpness). E2E: studio gating and abstention, plus an opt-in real-speech test that passed on a synthesized 38 s story: 3 memories with pride/nostalgia/regret, family/work/advice, and recall of the grandmother memory.
**Learned:** `'gpu' in navigator` is not enough; machines without an adapter crashed model loading, so the worker now requests an adapter and falls back to WASM. Whisper writes small numbers as words, so age parsing handles "eight".
**Next:** on-device emotion model, encrypted media storage, diarization, then the planned day-2 importers.
