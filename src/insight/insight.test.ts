import { describe, expect, it } from 'vitest';
import { emptyArchive } from '../archive/schema';
import { validateArchive } from '../archive/validate';
import { framePitch, prosody } from '../audio/features';
import { blend, dominant, scoreEmotions } from './emotions';
import { ingestAudio, segment, type TranscriptChunk } from './pipeline';
import { answer, search } from './recall';
import { classifyThemes, extractDate, extractPeople } from './themes';

describe('emotions', () => {
  it('finds the obvious emotion', () => {
    expect(dominant(scoreEmotions('I was so happy, we laughed all night'))).toBe('joy');
    expect(dominant(scoreEmotions('I cried for days after she passed away'))).toBe('sadness');
    expect(dominant(scoreEmotions('I was terrified and anxious before the exam'))).toBe('fear');
    expect(dominant(scoreEmotions('I should have called him. I regret it.'))).toBe('regret');
  });
  it('treats negation', () => {
    const e = scoreEmotions('I was not happy at that school');
    expect(dominant(e)).toBe('sadness');
  });
  it('returns neutral with no cues, and scores sum to ~1', () => {
    expect(scoreEmotions('The bus leaves at six.')).toEqual([{ label: 'neutral', score: 1 }]);
    const s = scoreEmotions('happy and grateful but a little scared');
    expect(s.reduce((a, b) => a + b.score, 0)).toBeCloseTo(1, 2);
  });
  it('uses tone of voice to break ties', () => {
    const text = 'I was angry and sad';
    expect(dominant(scoreEmotions(text, 0.95))).toBe('anger');
    expect(dominant(scoreEmotions(text, 0.05))).toBe('sadness');
  });
  it('blends distributions', () => {
    const b = blend([{ label: 'joy', score: 1 }], [{ label: 'love', score: 1 }], 0.75);
    expect(b[0]).toEqual({ label: 'love', score: 0.75 });
  });
});

describe('themes, people, dates', () => {
  it('sorts into life areas', () => {
    expect(classifyThemes('My mother and my brother came to my school')[0]).toBe('family');
    expect(classifyThemes('I got the job at the startup and my boss liked my code')[0]).toBe(
      'work',
    );
    expect(classifyThemes('My advice: always remember to be kind')).toContain('advice');
  });
  it('extracts people', () => {
    const p = extractPeople('Back then my friend Rahul and I met Priya at the station.');
    expect(p).toContainEqual({ name: 'Rahul', relation: 'friend' });
    expect(p.map((x) => x.name)).toContain('Priya');
    expect(extractPeople('My grandmother taught me to cook.')).toEqual([
      { name: 'my grandmother', relation: 'grandmother' },
    ]);
  });
  it('dates memories from years and ages', () => {
    expect(extractDate('In 2014 we moved to Pune', '2026-10-31')).toBe('2014-01-01');
    expect(extractDate('When I was 12 I broke my arm', '2026-10-31', 2001)).toBe('2013-01-01');
    expect(extractDate('Yesterday was fine', '2026-10-31')).toBe('2026-10-31');
    expect(extractDate('When I was eight, we moved', '2026-10-31', 2001)).toBe('2009-01-01');
  });
});

describe('prosody', () => {
  const sr = 16000;
  const tone = (hz: number, secs: number, amp: number) =>
    Float32Array.from({ length: sr * secs }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr));
  it('estimates pitch', () => {
    expect(framePitch(tone(200, 0.04, 0.5), sr)).toBeGreaterThan(190);
    expect(framePitch(tone(200, 0.04, 0.5), sr)).toBeLessThan(210);
    expect(framePitch(new Float32Array(640), sr)).toBe(0);
  });
  it('rates loud fast speech as more aroused than quiet slow speech', () => {
    const loud = prosody(tone(220, 3, 0.6), sr, 10);
    const quiet = prosody(tone(120, 3, 0.05), sr, 3);
    expect(loud.arousal).toBeGreaterThan(quiet.arousal);
    const withPause = new Float32Array(sr * 4);
    withPause.set(tone(150, 2, 0.3));
    expect(prosody(withPause, sr, 5).pauseRatio).toBeGreaterThan(0.4);
  });
});

const chunks: TranscriptChunk[] = [
  { text: 'When I was 8 my grandmother used to make parathas every Sunday.', start: 0, end: 4 },
  { text: 'I remember the smell of the kitchen, I miss those days so much.', start: 4, end: 8 },
  { text: 'She taught me that kindness is never wasted.', start: 8.2, end: 11 },
  { text: 'In 2019 I joined my first startup as an engineer.', start: 15, end: 19 },
  {
    text: 'I was terrified, but my boss Meera believed in me and I was proud of my first project.',
    start: 19,
    end: 25,
  },
];

describe('pipeline', () => {
  it('segments on long pauses', () => {
    const ps = segment(chunks, 200);
    expect(ps).toHaveLength(2);
    expect(ps[0]!.end).toBe(11);
    expect(ps[1]!.start).toBe(15);
  });
  it('produces a valid archive with sorted memories', () => {
    const { archive, memories } = ingestAudio(
      emptyArchive('Me'),
      { fileName: 'story.m4a', recordedAt: '2026-10-31', chunks },
      { birthYear: 2001 },
    );
    expect(validateArchive(archive).ok).toBe(true);
    expect(memories).toHaveLength(2);
    const [childhood, work] = memories;
    expect(childhood!.date).toBe('2009-01-01');
    expect(childhood!.themes).toContain('family');
    expect(childhood!.emotions![0]!.label).toBe('nostalgia');
    expect(work!.date).toBe('2019-01-01');
    expect(work!.themes![0]).toBe('work');
    expect(archive.people.map((p) => p.name)).toEqual(
      expect.arrayContaining(['my grandmother', 'Meera']),
    );
    expect(archive.voiceSamples).toHaveLength(2);
    expect(archive.sources[0]!.kind).toBe('audio');
  });
  it('analyzes tone when audio is present', () => {
    const pcm = Float32Array.from({ length: 16000 * 25 }, (_, i) => 0.3 * Math.sin(i / 8));
    const r = ingestAudio(emptyArchive('Me'), {
      fileName: 'a.wav',
      recordedAt: '2026-10-31',
      chunks,
      pcm,
      sampleRate: 16000,
    });
    expect(r.overall?.arousal).toBeGreaterThanOrEqual(0);
    expect(validateArchive(r.archive).ok).toBe(true);
  });
});

describe('recall', () => {
  const { archive } = ingestAudio(emptyArchive('Me'), {
    fileName: 's',
    recordedAt: '2026-10-31',
    chunks,
  });
  it('finds the right memory', () => {
    expect(search(archive.memories, 'grandmother cooking')[0]!.memory.text).toMatch(/parathas/);
    expect(search(archive.memories, 'your first job')[0]!.memory.text).toMatch(/startup/);
  });
  it('answers in recorded words with citations, or abstains', () => {
    const a = answer(archive, 'Tell me about your grandmother');
    expect(a.abstained).toBe(false);
    expect(a.citations.length).toBeGreaterThan(0);
    expect(a.text).toMatch(/grandmother/);
    expect(answer(archive, 'What is quantum chromodynamics?').abstained).toBe(true);
  });
});
