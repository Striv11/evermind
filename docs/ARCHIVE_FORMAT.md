# Evermind Archive Format (version 1)

The archive is how your data leaves Evermind. It is designed to be **readable without the app**: plain
UTF-8 JSON, no proprietary encoding, no encryption (encrypt it yourself, e.g. with `age`, if you want
that). Source of truth for types: [`src/archive/schema.ts`](../src/archive/schema.ts); validator:
[`src/archive/validate.ts`](../src/archive/validate.ts).

## Container

- **Minimal**: a single `evermind-archive.json` file.
- **Bundle** (`src/archive/bundle.ts`): a ZIP (stored entries, CRC-32 checked) containing `archive.json`, `attachments/<file>` and a script-free read-only `viewer.html` (CSP `default-src 'none'`). Import verifies size and sha256 of every attachment and validates the archive.
- **With attachments**: a ZIP containing `archive.json` plus `attachments/<file>`.
  Attachment bytes are never embedded in the JSON; each one is referenced by `path`, `bytes` and `sha256`.

## Top-level object

| Field           | Type                    | Notes                                                                    |
| --------------- | ----------------------- | ------------------------------------------------------------------------ |
| `format`        | `"evermind-archive"`    | Constant.                                                                |
| `version`       | integer                 | Currently `1`. Readers must reject versions newer than they understand.  |
| `createdAt`     | ISO 8601                | Export time.                                                             |
| `subject`       | `{displayName, isFictional}` | Whose data this is. `isFictional` is true for the demo persona.     |
| `aiDisclosure`  | string, non-empty       | The statement that any twin built from this is an AI reconstruction.     |
| `sources`       | `Source[]`              | Where data came from: `markdown`, `whatsapp`, `telegram`, `mbox`, `interview`, `audio`, `typed`, `demo`. |
| `people`        | `Person[]`              | `{id, name, relation?}`.                                                 |
| `memories`      | `EpisodicMemory[]`      | Dated events: `{id, date, text, sourceId, people?, place?, tags?, emotions?, themes?, span?}`. `emotions` is `[{label, score 0..1}]`, strongest first; `span` is `{start, end}` seconds within an audio source. |
| `facts`         | `SemanticFact[]`        | Knowledge-graph triples: `{id, subject, predicate, object, confidence 0..1, sourceIds, memoryIds?}`; `memoryIds` is provenance and must reference existing memories. |
| `voiceSamples`  | `VoiceSample[]`         | Only the subject's own words: `{id, text, sourceId, date?}`.             |
| `capsules`      | `TimeCapsule[]`         | `{id, createdAt, unlockAt, to, body}`.                                   |
| `attachments`   | `AttachmentRef[]`       | `{id, filename, mediaType, bytes, sha256, path}`.                        |

Optional fields: `identity` (derived profile), `interview` (questions already asked) and `fidelity`
(`[{id, question, reply, dimension, verdict: "me"|"not-me", correction?, citations[], ratedAt}]`): the
subject's verdicts on twin replies. A correction is also stored as a `typed` memory tagged `correction`.

Optional `legacy` (`{access: "owner"|"listed", listeners: [{name, relationship?}], offLimits: string[],
messages: [{id, to, text, createdAt, releaseOn}]}`) records who may talk to the twin, topics it must never
discuss and messages released on a date. Like time capsules it is **app-enforced**: conforming readers must
drop memories touching `offLimits` topics (whole-word, case-insensitive) from the twin's context and refuse
those questions, but nothing here is cryptographic. Message ids must be unique and `releaseOn` is `YYYY-MM-DD`.

Embeddings and the vector index are **derived data** and are intentionally not part of the archive; they
are rebuilt from `memories` on import.

## Rules (enforced by the validator)

1. All `id`s are non-empty strings, unique within their list.
2. Dates are ISO 8601 (`2026-01-31` or `2026-01-31T10:00:00Z`).
3. `memories[].sourceId`, `voiceSamples[].sourceId` and `facts[].sourceIds[]` must reference an existing source;
   `memories[].people[]` must reference existing people.
4. `capsules[].unlockAt` must not precede `createdAt`.
5. `memories[].emotions[].label` is one of `joy, love, gratitude, pride, hope, nostalgia, sadness, fear, anger, regret, neutral`.
5. `attachments[].path` must be relative, start with `attachments/`, and must not contain `..`.
6. `aiDisclosure` must be present.

## Time capsules: an honest caveat

A capsule's `body` is stored in the clear in the archive. "Locked until `unlockAt`" is enforced by the
Evermind app's UI, not by cryptography. Anyone who opens the JSON can read it. Real time-lock
encryption is on the roadmap as an opt-in.

## Versioning

Additive, backwards-compatible changes keep `version: 1`. Breaking changes bump `version`; the app will
ship a migration for every previous version.

## Vault envelope (internal, not the archive)

On-device storage uses a separate encrypted envelope (`evermind-vault`): PBKDF2-SHA256 (600,000
iterations, 16-byte random salt) derives 512 bits; the first 256 bits are the AES-256-GCM key, the
rest is a verifier whose SHA-256 is stored for wrong-passphrase detection. The header is authenticated as
GCM additional data and every save uses a fresh 96-bit IV. See [`src/vault/vault.ts`](../src/vault/vault.ts).
