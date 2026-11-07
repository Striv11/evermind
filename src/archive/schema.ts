/** Evermind Archive Format, version 1. Spec: docs/ARCHIVE_FORMAT.md */
import type { IdentityProfile } from '../identity/profile';
import type { DimensionId } from '../identity/dimensions';
import type { FidelityRating } from '../identity/fidelity';
import type { LegacyPolicy } from '../identity/legacy';

export const ARCHIVE_FORMAT = 'evermind-archive';
export const ARCHIVE_VERSION = 1;

/** Shown wherever the twin speaks; part of the archive so it survives export. */
export const AI_DISCLOSURE =
  'This is an AI reconstruction built from the subject’s own data. It is not the person and does not speak for them.';

export type SourceKind =
  'markdown' | 'whatsapp' | 'telegram' | 'mbox' | 'interview' | 'audio' | 'typed' | 'demo';

/** Emotion labels used across the app; see src/insight/emotions.ts. */
export const EMOTIONS = [
  'joy',
  'love',
  'gratitude',
  'pride',
  'hope',
  'nostalgia',
  'sadness',
  'fear',
  'anger',
  'regret',
  'neutral',
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export interface EmotionScore {
  label: Emotion;
  score: number; // 0..1
}

export interface Source {
  id: string;
  kind: SourceKind;
  label: string;
  importedAt: string; // ISO 8601
}

/** A dated event the subject remembers or wrote about. */
export interface EpisodicMemory {
  id: string;
  date: string; // ISO 8601 date or datetime
  text: string;
  sourceId: string;
  people?: string[]; // Person ids
  place?: string;
  tags?: string[];
  /** Strongest first. Derived from words, and for audio also from tone of voice. */
  emotions?: EmotionScore[];
  /** Life areas such as "family" or "work"; see src/insight/themes.ts. */
  themes?: string[];
  /** For audio sources: where in the recording this memory was spoken, in seconds. */
  span?: { start: number; end: number };
}

/** A durable statement (belief, preference, relationship) as subject-predicate-object. */
export interface SemanticFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number; // 0..1
  sourceIds: string[];
  /** Memories this fact was derived from (provenance); optional for hand-written facts. */
  memoryIds?: string[];
}

export interface Person {
  id: string;
  name: string;
  relation?: string;
}

/** A message written by the subject; used only for the style model. */
export interface VoiceSample {
  id: string;
  text: string;
  sourceId: string;
  date?: string;
}

/** Message sealed until `unlockAt`. Honest note: enforced by the app, not by cryptography. */
export interface TimeCapsule {
  id: string;
  createdAt: string;
  unlockAt: string;
  to: string;
  body: string;
}

export interface AttachmentRef {
  id: string;
  filename: string;
  mediaType: string;
  bytes: number;
  sha256: string; // lowercase hex
  path: string; // relative path inside the archive zip, e.g. attachments/ab12.jpg
}

export interface Archive {
  format: typeof ARCHIVE_FORMAT;
  version: number;
  createdAt: string;
  subject: { displayName: string; isFictional: boolean };
  aiDisclosure: string;
  sources: Source[];
  people: Person[];
  memories: EpisodicMemory[];
  facts: SemanticFact[];
  voiceSamples: VoiceSample[];
  capsules: TimeCapsule[];
  attachments: AttachmentRef[];
  /** Derived understanding of the person (rebuildable from memories). */
  identity?: IdentityProfile;
  /** Interview questions already asked, so the interviewer never repeats itself. */
  interview?: InterviewTurn[];
  /** The person's verdicts on twin replies ("that's me" / "not me"). */
  fidelity?: FidelityRating[];
  /** Who may talk to the twin, off-limits topics, and posthumous messages. */
  legacy?: LegacyPolicy;
}

export interface InterviewTurn {
  question: string;
  dimension: DimensionId;
  askedAt: string;
}

export function emptyArchive(displayName: string, now = new Date()): Archive {
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    createdAt: now.toISOString(),
    subject: { displayName, isFictional: false },
    aiDisclosure: AI_DISCLOSURE,
    sources: [],
    people: [],
    memories: [],
    facts: [],
    voiceSamples: [],
    capsules: [],
    attachments: [],
  };
}
