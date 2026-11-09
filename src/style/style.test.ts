// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { demoArchive } from '../demo/persona';
import { styleSection } from '../ui/styleView';
import {
  buildStylePrompt,
  computeStyleProfile,
  evaluateStyle,
  styleSimilarity,
  words,
} from './profile';

const terse = [
  'Well, the tide waits. Come by Sunday?',
  'Honestly? Do the dull thing well.',
  'Well, the kettle is on. Come by later?',
  'Honestly? The light never needed to be clever.',
  'Well, the bees are fine. Come by Sunday?',
  'Honestly? Rain again, same as ever.',
  'Well, the boat is in. Come by tonight?',
  'Honestly? Tea first, then the work.',
];
const chatty = [
  "omg i just can't believe it!!! 😂 we totally have to go there again and eat all the things!",
  'lol yes!!! 😍 that was so much fun, and i really really want to do it again soon!',
  'haha 😂 i know right!!! best day ever, honestly, and everyone was so nice to us!',
  'wow!!! 🎉 i am so happy that we did this, because it was just amazing and fun!',
];

describe('style profile', () => {
  it('is deterministic and measures basic features', () => {
    const a = computeStyleProfile(terse);
    expect(computeStyleProfile(terse)).toEqual(a);
    expect(a.sampleCount).toBe(8);
    expect(a.avgSentenceLength).toBeGreaterThan(2);
    expect(a.avgSentenceLength).toBeLessThan(8);
    expect(a.punctuation.question).toBeGreaterThan(5);
    expect(a.emojiPer100).toBe(0);
    expect(a.vocabRichness).toBeGreaterThan(0.5);
  });
  it('counts emoji, exclamations and lowercase starts', () => {
    const c = computeStyleProfile(chatty);
    expect(c.emojiPer100).toBeGreaterThan(3);
    expect(c.punctuation.exclaim).toBeGreaterThan(5);
    expect(c.lowercaseStart).toBe(1);
  });
  it('finds signature phrases used across samples only', () => {
    const p = computeStyleProfile(terse);
    expect(p.signaturePhrases).toContain('come by');
    expect(p.signaturePhrases.every((s) => s.includes(' '))).toBe(true);
    expect(computeStyleProfile(['one lone phrase here']).signaturePhrases).toEqual([]);
  });
  it('handles empty input', () => {
    const e = computeStyleProfile([]);
    expect(e.wordCount).toBe(0);
    expect(styleSimilarity(e, 'hello there')).toBe(0);
    expect(words('')).toEqual([]);
  });
});

describe('style similarity', () => {
  it('scores held-out own writing above a different voice', () => {
    const r = evaluateStyle(terse, chatty);
    expect(r.heldOut).toBe(2);
    expect(r.trained).toBe(6);
    expect(r.own).toBeGreaterThan(r.foreign!);
    expect(r.own).toBeGreaterThan(0.5);
  });
  it('is bounded 0..1', () => {
    const p = computeStyleProfile(terse);
    for (const t of [...chatty, 'x', '😂😂😂']) {
      const s = styleSimilarity(p, t);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('style prompt and view', () => {
  it('describes style and keeps the AI disclosure', () => {
    const pr = buildStylePrompt(computeStyleProfile(terse));
    expect(pr).toMatch(/short|medium/);
    expect(pr).toMatch(/Often asks questions/);
    expect(pr).toMatch(/"come by"/);
    expect(pr).toMatch(/AI reconstruction/);
  });
  it('refuses to describe a style from too little text', () => {
    expect(buildStylePrompt(computeStyleProfile(['hi']))).toMatch(/Not enough/);
  });
  it('renders the viewer for the demo and an empty state', () => {
    const el = styleSection(demoArchive());
    expect(el.querySelector('[data-testid=style-prompt]')?.textContent).toBeTruthy();
    const empty = demoArchive();
    empty.voiceSamples = [];
    expect(styleSection(empty).textContent).toMatch(/No writing samples/);
  });
});
