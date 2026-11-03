# Plan

Fourteen-day arc (flagship). Every milestone has acceptance criteria that can be checked by a test or a command. `bash check.sh` must pass at the end of every day.

| Day | Milestone                                            | Acceptance criteria                                                                                                                                                                                                                                                                                                       | Status |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Scaffold, archive spec, vault, landing + demo shell  | Vite/TS strict/Vitest/ESLint/Prettier/Playwright set up; `docs/ARCHIVE_FORMAT.md` + typed schema + validator tests (dangling refs, dup ids, bad dates); vault create/unlock/lock with wrong-passphrase and tamper tests; landing, theme toggle, shortcuts, demo persona validated; Pages workflow; 3 e2e flows pass | [x]    |
| 2   | Importers I: markdown/journal + plain-text Q&A       | Parsers produce `Source` + `EpisodicMemory`; date extraction from filenames/front-matter/headings; fixtures + tests; imported data validates against schema; drag-and-drop UI with error states                                                                                                                            | [x]    |
| 3   | Importers II: WhatsApp, Telegram JSON, mbox          | Only the user's own messages become `VoiceSample`s (author selection UI); multi-line messages, system lines, quoted-printable/base64 mbox bodies handled; 1 MB fixture parses in < 500 ms                                                                                                                                  | [x]    |
| 4   | Guided life interview                                | Question bank (childhood, values, people, places, regrets, advice) with gap detection from existing memories; answers saved as memories; resumable; keyboard-first UI; e2e                                                                                                                                                | [x]    |
| 5   | Chunking + on-device embeddings + vector index       | Chunker with overlap and date/people metadata; transformers.js embeddings in a Web Worker with progress UI; flat index + HNSW behind one interface; persisted in the vault; recall@5 benchmark script                                                                                                                     | [ ]    |
| 6   | Knowledge graph + timeline/graph visualizations      | Fact extraction (rule-based + embedding-assisted) into triples with provenance; SVG timeline and force-directed graph; click a node to see source memories; accessible list fallback                                                                                                                                       | [ ]    |
| 7   | Style model                                          | Stylometric profile (vocab richness, sentence length, emoji, signature phrases, punctuation); deterministic and unit-tested; profile viewer; style prompt builder; similarity score on held-out samples                                                                                                                   | [ ]    |
| 8   | Grounded chat: retrieval-only core                   | Retrieval-grounded answers with citations to memory ids; abstain ("I don't remember that") below a tuned threshold; deterministic output; AI label on every message; chat UI with loading/error states                                                                                                                    | [ ]    |
| 9   | Local LLM via WebLLM/WebGPU                          | Feature-detect WebGPU, download progress, streaming generation conditioned on style + retrieved memories; automatic fallback to day-8 retrieval-only; citations preserved; refuses persona claims                                                                                                                         | [ ]    |
| 10  | Legacy I: archive export/import + attachments        | ZIP container with `archive.json` + attachments and sha256 verification; import round-trip test; standalone read-only `viewer.html` inside the export                                                                                                                                                                      | [ ]    |
| 11  | Legacy II: time capsules + life book                 | Capsule create/seal/unlock by date with a clock-injected unit test; printable life book (print CSS, chapters by decade, citations)                                                                                                                                                                                         | [ ]    |
| 12  | Evals + performance budgets                          | Eval set (>= 60 questions on the demo persona): recall@k, grounding rate, abstention precision, results in `docs/EVALS.md`; budgets (initial JS < 60 KB gzip, vault unlock < 1.5 s, search < 50 ms at 10k chunks) asserted by a benchmark                                                                                  | [ ]    |
| 13  | Product polish                                       | Onboarding flow, empty/loading/error states everywhere, responsive audit at 360 px, auto-lock timer, axe accessibility checks in e2e, README screenshots refreshed                                                                                                                                                         | [ ]    |
| 14  | Hardening + release                                  | Argon2id-WASM option with envelope migration; security review pass; full e2e on desktop + mobile; v1.0 tag, demo GIF, README final                                                                                                                                                                                         | [ ]    |

## Pulled forward on 2026-10-31 (user request): audio life story + digital self

| Milestone | Acceptance criteria | Status |
| --- | --- | --- |
| Audio studio | Upload or record audio/video; decode to 16 kHz mono; on-device Whisper (WebGPU with WASM fallback) in a worker; progress UI | [x] |
| Emotion + life-area sorting | Lexicon emotions with negation and intensifiers, refined by tone of voice (energy, pitch variation, speaking rate); 12 life areas; people and dates (years, ages incl. number words) | [x] |
| Memories view | Emotional spectrum, emotion and life-area filters, cards with people and scores | [x] |
| Digital self | Consent gate; ElevenLabs instant voice clone + TTS; D-ID talking video from the sharpest frame of the user's video; keys in memory only | [x] |
| Real-speech e2e | `STORY_WAV=... npx playwright test -g "real speech"` passes on synthesized speech | [x] |
| Follow-ups | On-device emotion model (go_emotions ONNX) blended with the lexicon; store voice/face media encrypted in the vault so cloning survives reloads; persist voice id; speaker diarization so only the user's speech is kept; streaming D-ID avatar for live conversation | [ ] |

## Full capture system (2026-10-31, user request: "capture all of me")

| Milestone | Acceptance criteria | Status |
| --- | --- | --- |
| Capture map | 12 dimensions with facets and question banks; coverage per dimension from memories, traits and minutes of speech; overall % | [x] |
| Adaptive interviewer | Asks for the weakest dimension, never repeats; Claude-written follow-ups with a key, question bank without; answer by voice or typing | [x] |
| Identity model | Claude reads all memories and returns a schema-validated profile (summary, Big Five, traits per dimension with evidence and confidence, speech style, phrases, gaps); invented evidence is dropped; user can delete wrong traits | [x] |
| Twin brain | Streaming multi-turn chat as the person; cites memories [m:id], marks inference, refuses to invent events; voice and video per reply | [x] |
| Live Claude verification | Run understand / interview / chat against the real API with the user's key and review quality | [ ] |
| Fidelity loop | User rates twin answers ("that's me" / "not me" + correction); corrections become memories; per-dimension fidelity score | [x] |
| Live conversation | Mic in, streamed reply, cloned voice out, streaming avatar | [ ] |
| Memory over time | Twin remembers its own conversations; journal mode; profile diff over months | [ ] |
| Legacy controls | Who may talk to the twin, topics off-limits, posthumous messages | [x] |

## Stretch

- Optional time-lock encryption for capsules (drand/tlock-style), clearly opt-in.
- Voice-note transcription with a local Whisper model.
- Multiple vaults / subjects, with a "family archive" merge.
