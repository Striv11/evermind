/** Zod schema for the profile the model returns (loaded only with the brain). */
import { z } from 'zod';
import { DIMENSIONS, type DimensionId } from './dimensions';
import type { IdentityProfile } from './profile';

const DIMENSION_IDS = DIMENSIONS.map((d) => d.id) as [DimensionId, ...DimensionId[]];

/** One thing the system has learned about the person, with the memories that show it. */
export const TraitSchema = z.object({
  dimension: z.enum(DIMENSION_IDS),
  statement: z
    .string()
    .describe('First person, specific, e.g. "I value honesty over kindness when they conflict"'),
  evidence: z.array(z.string()).describe('ids of memories that support this'),
  confidence: z.number().describe('0..1; low when inferred from a single passing remark'),
});

const BigFive = z.object({
  score: z.number().describe('0..1'),
  evidence: z.array(z.string()),
});

export const ProfileSchema = z.object({
  summary: z
    .string()
    .describe('A first-person paragraph: who I am, what drives me, how I come across'),
  bigFive: z.object({
    openness: BigFive,
    conscientiousness: BigFive,
    extraversion: BigFive,
    agreeableness: BigFive,
    neuroticism: BigFive,
  }),
  traits: z.array(TraitSchema),
  speech: z.object({
    style: z.string().describe('How I talk: rhythm, register, languages mixed, warmth'),
    phrases: z.array(z.string()).describe('Exact recurring words or phrases from my own speech'),
  }),
  gaps: z
    .array(z.string())
    .describe('Important things about me that are still unknown, as short questions'),
});

// Compile-time guarantee that what the model returns matches the stored profile type.
type ModelProfile = z.infer<typeof ProfileSchema>;
type Stored = Omit<IdentityProfile, 'updatedAt' | 'basedOnMemories'>;
export const schemaMatchesProfile: [ModelProfile] extends [Stored]
  ? [Stored] extends [ModelProfile]
    ? true
    : never
  : never = true;
