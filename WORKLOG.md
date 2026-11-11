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

## 2026-10-31 (later): Full capture system, identity model, twin brain

**Changed:** Added the capture map (12 dimensions: life story, people, values, beliefs, opinions, personality, emotional life, humor, how you talk, decisions, tastes, legacy), with coverage scoring and an adaptive interviewer that targets the weakest dimension. Added the identity model: Claude (claude-opus-5-5, structured output via Zod, server-side refusal fallback) reads every memory and returns a profile, and every trait must cite real memory ids. Added the twin brain: a streaming, multi-turn chat in the person's voice, with inline memory citations and explicit inference. Typed answers are a new `typed` source kind; the archive carries optional `identity` and `interview` fields (validated).
**Perf:** the Anthropic SDK and Zod load lazily with the brain chunk; the initial JS bundle stays at ~24 KB gzip.
**Tests:** 52 unit tests, including the brain against a faked HTTP layer (request shape, structured format, fallbacks, streaming, citation filtering) and a compile-time check that the model schema matches the stored profile type. E2E on desktop and mobile: capture map → typed answer → coverage rises → memory appears.
**Not yet verified:** live Claude calls (no key in CI); the first real run with the user's key is the test.
**Next:** fidelity loop, live voice conversation, twin memory, legacy controls.

## 2026-11-01: Fidelity loop

**Changed:** Every twin reply now asks "Does this sound like you?" with "That's me" / "Not me". "Not me" opens a box for what the person would really say; that text is saved as a `typed` memory tagged `correction`, so the next reply and the next profile build can use it. Verdicts are stored in the archive (`fidelity`, validated, documented in `ARCHIVE_FORMAT.md`). Each question is assigned to one of the 12 dimensions (wording cues first, then themes of the question and cited memories), and the capture panel shows the share of "that's me" overall and per dimension. Code is in `src/identity/fidelity.ts`.
**Tests:** 6 new unit tests (classification, rating with and without correction, citation filtering, scores, archive validation incl. duplicates) and an e2e flow on desktop and mobile (ask, mark not-me, correct, see the memory and 0% fidelity).
**Learned:** the theme-to-dimension mapping is many-to-many, so a memory tagged family/places/beliefs lands on "Life story" in a tie; fine for a score, but the cues are what keep it accurate for typical questions.
**Not yet verified:** fidelity with real Claude replies (still no key in CI). Scores are raw shares, not smoothed, so one rating reads as 0% or 100%; the UI shows the count next to it.
**Next:** live Claude verification with a real key, then live voice conversation, or twin memory of its own conversations.

## 2026-11-01 (later): Legacy controls

**Changed:** New `legacy` policy in the archive (`src/identity/legacy.ts`, validated, documented): an access mode (only me / people I list), off-limits topics, and messages sealed until a release date. Off-limits topics are enforced three ways: questions that mention one are refused before any model call, memories and profile traits that touch one are withheld from retrieval and the persona prompt, and the prompt tells the model to keep them private. The offline retrieval answer obeys the same rules. Studio step 5 edits the policy; sealed messages show only once their date has passed (clock injected in tests).
**Tests:** 8 new unit tests (word-boundary matching, memory filtering, gating in both answer paths, prompt rule, access, date release and ordering, validation) and an e2e flow on desktop and mobile.
**Learned:** whole-word matching is deliberately literal: "money" does not block "finances". Synonyms need the user to list them; stated in the UI copy. The policy is app-enforced, not cryptographic, and the UI says so.
**Not yet verified:** how well the model honours the prompt rule with a real key. The "listed people" access mode is stored and checked by `canTalk`, but nothing yet asks a visitor who they are; that needs a separate read-only twin view (see next).
**Next:** live Claude verification with a key, a shareable read-only twin view that uses `canTalk`/released messages, or memory over time.

## 2026-11-02: Importers I (markdown, journals, Q&A)

**Changed:** New `src/importers`. `markdown.ts` parses `.md`/`.txt` files: front matter (date, title, tags), dates from file names (`2019-03-04`, `20190304`) and from headings ("March 4, 2019", "4th of March 2019", "June 2014"), splitting a journal into one entry per dated heading, `Q:`/`A:` lists with multi-line answers, and markdown stripping. Impossible dates (Feb 30) are rejected. Date precedence: dated heading, then front matter, then file name, then a year/age mentioned in the text, then the import date. `ingest.ts` turns entries into memories (emotions, life areas, people, tags), chunks long entries on paragraph breaks, adds the text as voice samples, and reports per-file errors without aborting the batch. Studio has a drag-and-drop zone with error states.
**Tests:** 12 new unit tests (formats, precedence, Q&A, errors, chunking, schema validity, no input mutation) and an e2e flow for desktop and mobile.
**Not yet verified:** the new e2e could not run here (Playwright browsers are not installed in this sandbox); it needs a CI run. Unit tests and `check.sh` pass.
**Learned:** prettier rewrites a literal BOM in a regex into an invisible character that ESLint rejects; check `charCodeAt(0) === 0xfeff` instead.
**Next:** day 3 importers (WhatsApp, Telegram JSON, mbox) with author selection so only the user's own messages become voice samples.

## 2026-11-03: Importers II (WhatsApp, Telegram, mbox)

**Changed:** New `src/importers/chat.ts`: WhatsApp text exports (iOS `[d/m/y, time]` and Android `d/m/y, time -` styles, 12/24 h, day-first vs month-first inferred from any component above 12, multi-line messages, system and "media omitted" lines skipped), Telegram `result.json` (rich-text arrays flattened, service messages ignored) and mbox (quoted-printable, base64, RFC 2047 names, multipart/alternative, quoted replies and signatures stripped). `detectFormat` routes dropped files; `importChat` keeps only the author the user picks: every own message is a `VoiceSample`, days with at least 25 words also become memories. Other people's text never enters the archive. Studio shows an author picker (message counts) for each chat file.
**Tests:** 11 new unit tests including a 1 MB WhatsApp fixture parsed under the 500 ms budget, schema validity after import, and a check that the other author's text is absent. Added an e2e for the author picker (not run here: no Playwright browsers in this sandbox).
**Learned:** prettier also inlines `‎` (WhatsApp's LTR mark) and BOM escapes in regexes, which ESLint then rejects as irregular whitespace; use char-code checks or keep escapes out of prettier's reach.
**Not yet verified:** real exports from phones (only synthetic fixtures); locales with non-numeric dates or Arabic-Indic digits are unsupported and report "No WhatsApp messages found".
**Next:** day 4 guided life interview (question bank with gap detection, resumable, keyboard-first).

## 2026-11-03 (later): Guided life interview

**Changed:** New `src/identity/interview.ts`: 18 facet-tagged questions (childhood, school, work, places, family, friends, partners, mentors, regret, grief, fear, food, advice, dreams, lessons…) on top of the dimension banks. Gap detection marks a facet covered when the person's own memories mention its cue words; `nextQuestion` takes the weakest dimension, then uncovered facets, then general questions, then covered facets, never repeating. Moved `nextQuestion` out of `profile.ts`. Studio shows the facet, progress ("n of N prepared questions") and keyboard shortcuts (t type, s skip, Ctrl+Enter save, Esc close). Resumability comes from the asked-questions list stored in the encrypted archive; no plaintext drafts are written anywhere.
**Tests:** 4 new unit tests (facet coverage, ordering, exhaustion/no repeats/schema validity, topic coverage) and an e2e for the keyboard flow (not run here: no Playwright browsers in this sandbox).
**Learned:** unsaved drafts are deliberately not persisted, since that would put plaintext outside the vault.
**Next:** day 5 chunking, on-device embeddings and vector index.

## 2026-11-04: Chunking, embeddings, vector index (core)

**Changed:** New `src/retrieval`. `chunk.ts` splits memories on sentence boundaries into overlapping chunks (default 80 words, 15 overlap) carrying memory id, date and people. `vector.ts` has one `VectorIndex` interface with an exact `FlatIndex` and a seeded, deterministic `HnswIndex`; `createIndex` picks HNSW above 2000 vectors. `embed.ts` defines `Embedder` plus a dependency-free `HashingEmbedder` (hashed unigrams/bigrams, light stemming); `embed.worker.ts` + `neural.ts` run all-MiniLM-L6-v2 (q8) via transformers.js in a worker with download/batch progress. `search.ts` (`SemanticIndex`) builds chunks, embeds, indexes and returns hits de-duplicated per memory. A 16-question paraphrased eval set on the demo persona lives in `evalset.ts`; `npm run bench:recall` prints recall@1/@5.
**Tests:** 7 new unit tests (chunk caps/overlap/coverage, flat exactness, HNSW recall@10 >= 0.9 vs exact on 1500 clustered vectors and determinism, demo recall@5 = 1.0, recall@1 >= 0.7, per-memory de-dup).
**Learned:** HNSW with plain nearest-neighbour link selection reached 1.0 recall on uniform vectors and on queries from the data's clusters, but only ~0.57 for queries far from every cluster. Real queries sit near the data, so I tested that, but the diversity heuristic from the paper would make it more robust.
**Not yet verified:** the neural worker has not been run (no browser or model download in this sandbox), so recall figures are for the hashing embedder only. Not done from day 5: progress UI, persisting the index in the vault, and nothing in the app calls `SemanticIndex` yet. Day 5 is marked partial (`[~]`) in PLAN.md.
**Next:** finish day 5 (wire embedding progress into Studio, persist vectors encrypted in the vault, neural recall numbers), consider the HNSW neighbour heuristic; then day 6.

## 2026-11-04 (later): Index snapshots and incremental embedding

**Changed:** `SemanticIndex.snapshot()` returns a JSON-serializable `IndexSnapshot` (chunks plus base64 float32 vectors, tagged with embedder name and dimension). `SemanticIndex.build(..., { cache })` reuses vectors for chunks whose text is unchanged and only embeds the rest; `reused` reports how many. A snapshot from a different embedder or dimension is ignored.
**Tests:** 2 new unit tests (JSON round-trip gives identical search results; editing one memory re-embeds only its chunks; mismatched embedder reuses nothing). 102 tests pass.
**Not done (day 5 stays `[~]`):** the snapshot is not yet written to the vault, since the vault encrypts a single archive blob and a second sealed record needs an envelope design. Also still missing: the Studio progress UI, neural recall numbers (the worker has not been run here) and the HNSW diversity heuristic. Nothing in the app calls `SemanticIndex` yet.
**Next:** vault side-record for the snapshot (same key, separate AAD), wire progress into Studio, then finish day 5 and start day 6.

## 2026-11-05: Vault side-records for the vector index

**Changed:** The vault can now seal named side records (`sealRecord`/`openRecord`) under the same AES-GCM key. AAD is the envelope header AAD plus the record name, so a record cannot be renamed, moved to another vault, or confused with the main archive ciphertext. `VaultStorage` gained `loadRecord`/`storeRecord`; `wipe()` now clears the IndexedDB store, so records go with the envelope. New `src/retrieval/persist.ts` saves and loads the `IndexSnapshot` through it; a corrupt or foreign record loads as `null` (the index is derived data, so the caller just re-embeds).
**Tests:** 7 new (record round-trip, no plaintext, re-unlock, rename/modify/foreign-vault rejection, fresh IVs, locked, wipe, envelope ciphertext not openable as record, persisted index reuse, corrupt record falls back). 109 pass.
**Not done (day 5 stays `[~]`):** nothing in the UI calls `saveIndexSnapshot`/`SemanticIndex` yet; Studio embedding progress UI; neural recall numbers (worker not run here); HNSW diversity heuristic.
**Next:** wire the index into the app (build on unlock with cache, save after archive changes, progress bar), then day 6.


## 2026-11-06: Index wired into the app

**Changed:** New `src/retrieval/sync.ts` (`syncIndex`): loads the encrypted snapshot, embeds only changed chunks, saves the snapshot when the index changed (including removals). The unlocked vault panel now shows a search box with an indexing progress bar; the index is built on first view per session (hashing embedder) and reused from the vault afterwards. Lock clears the in-memory index. Day 5 ticked off.
**Tests:** 3 new unit tests (first build then full reuse; one edited memory re-embeds only its chunks; removal shrinks the stored index with zero embedding).
**Not verified:** the search UI has no e2e and was not run in a browser here; the neural MiniLM embedder is still not wired into the UI or benchmarked (worker never run in this sandbox), and the HNSW diversity heuristic is not done. Day 5 is ticked on the basis of the hashing embedder; neural numbers remain open.
**Next:** day 6 knowledge graph and timeline/graph visualizations.

## 2026-11-07: Knowledge graph, timeline and graph views

**Changed:** New `src/graph`. `extract.ts` pulls triples out of memories with rules (first-person verbs like "I love/regret/keep", journal fragments like "Bought four hives", "Regret: ...", person relations and places from metadata); each triple carries the memory ids it came from. `mergeSimilar` is the embedding-assisted pass that merges near-duplicate objects for the same subject and predicate. `withExtractedFacts` adds extracted facts to an archive without touching hand-written ones. `graph.ts` builds nodes and edges (self/person/place/thing, evidence memories) and a deterministic Fruchterman-Reingold layout. New `graphView.ts`: SVG timeline and force-directed graph, keyboard-focusable, click or Enter shows the source memories, and a "same graph as a list" fallback. `SemanticFact` gained optional `memoryIds` (validated, documented in ARCHIVE_FORMAT.md); demo facts now have provenance. The demo page renders all of it.
**Tests:** 11 new (extraction with provenance, nothing-invented check, originals untouched and archive still valid, determinism, embedding merge, node kinds and evidence, layout bounds, view click and list fallback in jsdom). 120 pass.
**Not verified:** no browser here, so the SVG was never looked at visually and there is no e2e. Extraction is English-only and tuned on the demo persona; real journals will need more rules. The graph is only on the demo page, not yet in the unlocked vault view. Day 6 is `[~]` for those reasons.
**Next:** show the graph for the user's own vault (extract on unlock, store facts), an e2e for the graph, then day 7 style model.

## 2026-11-08: Graph in the unlocked vault

**Changed:** The unlocked vault panel now renders the timeline/graph section for the user's own memories. Facts are extracted in memory on render (`withExtractedFacts`) and not written back, so the archive stays hand-authored and nothing new is persisted. Empty vaults show no graph. Day 6 ticked off.
**Tests:** 2 new jsdom tests that create, unlock and render a real vault (graph and list fallback present for the demo archive; absent when empty). 122 pass.
**Not verified:** no browser here, so still no visual check or e2e of the graph. The click in the first test only checks it does not throw. Extraction is English-only and tuned on the demo persona.
**Next:** day 7 style model (stylometric profile, prompt builder, similarity score).

## 2026-11-09: Style model

**Changed:** New `src/style/profile.ts`: deterministic stylometric profile (sentence length mean/std, moving-average type/token ratio, punctuation per 100 words, emoji rate, lowercase starts, caps ratio, signature phrases = n-grams shared by >= 2 samples, function-word frequencies). `styleSimilarity` blends function-word cosine with closeness on punctuation/length/emoji habits; `evaluateStyle` holds out every 4th sample and scores it against the profile (and optionally foreign text). `buildStylePrompt` turns the profile into a prompt fragment that keeps the AI-reconstruction disclosure and declines to describe style from < 30 words. New `styleView.ts` viewer shown on the demo page and in the unlocked vault when voice samples exist. Day 7 ticked off.
**Tests:** 9 new (determinism, feature counts, signature phrases, empty input, held-out own > foreign, bounds, prompt, view). 131 pass.
**Learned:** Separation on tiny synthetic corpora is easy; the weights in `styleSimilarity` are untuned guesses and the demo persona has only 3 samples, so real accuracy is unmeasured. English-centric word list.
**Not verified:** viewer not seen in a browser; no e2e.
**Next:** day 8 retrieval-only grounded chat with citations and abstention.

## 2026-11-09 (later): Grounded retrieval-only chat

**Changed:** New `src/chat/grounded.ts`: `groundedAnswer` searches the semantic index, keeps only memories above a similarity threshold (0.14), quotes up to two (second only if >= 75% of the top score), and cites memory ids and dates; otherwise replies "I don't remember that." Off-limits topics are refused before retrieval and off-limits memories are filtered out. Every reply, including abstentions, carries an `AI reconstruction` label. Deterministic. New `src/ui/chatView.ts` "Ask" section in the unlocked vault (indexing-not-ready message, thinking and error states, label and citations per reply).
**Tuned:** with the hashing embedder, in-scope top scores span 0.115-0.40 and 8 out-of-scope questions peak at 0.134, so the ranges overlap. 0.14 abstains on 8/8 out-of-scope and cites the right memory for about 11/16 in-scope questions; I chose abstaining over wrong answers. The test asserts >= 65% and 8/8.
**Tests:** 6 new (grounding, citations valid and quoted, determinism, empty input, threshold, off-limits, message rendering).
**Not verified:** UI not run in a browser, no e2e; threshold is for the hashing embedder only and the neural model needs its own tuning. The older BM25 `answer` in the Studio still exists separately.
**Next:** day 9 WebLLM/WebGPU generation with fallback to this module.

## 2026-11-10: Local LLM generation with fallback

**Changed:** New `src/chat/generate.ts`: `LlmEngine` interface, `detectWebGpu`, `buildMessages` (disclosure, style prompt, memories as `[m:id]`, cite-only-from-memories rules), `generateAnswer` (retrieval first via `groundedAnswer`, so gating/abstention/off-limits stay; then streams the model, strips invented citation ids, and falls back to the retrieval answer on engine error, empty output, no valid citation, or output claiming to be human; persona-claim questions get a fixed refusal with no model call), and `loadWebLlmEngine` (lazy import of `@mlc-ai/web-llm`, progress callback, returns null without WebGPU or package). Chat UI got a "Use local model (WebGPU)" button with download progress and graceful fallback message.
**Tests:** 9 new in `generate.test.ts` using fake engines and a fake WebLLM module. 146 pass.
**Not verified:** `@mlc-ai/web-llm` is not installed (no network here), so the real engine has never run; the adapter is checked only against a fake of its API shape, which I wrote from memory. The UI path is untested in a browser, and the model id is unvetted. Token streaming is not rendered incrementally in the UI yet (onToken unused there). Day 9 is `[~]`.
**Next:** add the dependency and try it in a WebGPU browser, stream tokens into the bubble, then day 10 (ZIP export/import).

## 2026-11-11: ZIP bundle export/import

**Changed:** `src/archive/zip.ts` (dependency-free ZIP writer/reader: stored entries, CRC-32, rejects traversal/duplicates/corruption), `bundle.ts` (`exportBundle`/`importBundle`: archive.json + attachments + viewer.html; size and sha256 checked both ways; archive validated on import), `viewer.ts` (standalone read-only HTML, escaped, no scripts, strict CSP, shows the AI disclosure). Vault panel got an "Export bundle (.zip + viewer)" button. Format doc updated.
**Tests:** 9 new (CRC check value, zip round trip, corruption, demo round trip, attachment round trip, mismatch/missing, tampered attachment, bad bundles, viewer escaping). 
**Not verified:** UI download not run in a browser. The vault does not store attachment bytes yet, so the UI exports attachment-free bundles only; no import UI (needs merge-vs-replace decision). Compressed (deflate) zips from other tools are rejected. Day 10 is `[~]`.
**Next:** import UI + attachment storage in the vault, then day 11 capsules/life book.
