/**
 * Tone-of-voice features from mono PCM. Pure functions, so they are unit-tested
 * with synthetic signals. "Arousal" (calm 0 .. intense 1) combines loudness,
 * loudness variation, pitch variation and speaking rate.
 */
export interface Prosody {
  rms: number; // mean frame energy
  rmsVar: number; // coefficient of variation of energy
  pitchHz: number; // median voiced pitch, 0 if unvoiced
  pitchVar: number; // coefficient of variation of pitch
  pauseRatio: number; // share of silent frames
  wordsPerMin: number;
  arousal: number; // 0..1
}

const FRAME = 0.04; // seconds

export function frameRms(pcm: Float32Array, sampleRate: number): number[] {
  const n = Math.max(1, Math.round(FRAME * sampleRate));
  const out: number[] = [];
  for (let i = 0; i + n <= pcm.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += pcm[j]! * pcm[j]!;
    out.push(Math.sqrt(s / n));
  }
  return out;
}

/** Autocorrelation pitch estimate for one frame, in Hz; 0 when unvoiced. */
export function framePitch(frame: Float32Array, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / 400); // 400 Hz
  const maxLag = Math.min(frame.length - 1, Math.ceil(sampleRate / 70)); // 70 Hz
  let energy = 0;
  for (const x of frame) energy += x * x;
  if (energy / frame.length < 1e-4) return 0;
  let best = 0;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i + lag < frame.length; i++) c += frame[i]! * frame[i + lag]!;
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  return best / energy > 0.3 && bestLag > 0 ? sampleRate / bestLag : 0;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const cv = (xs: number[]) => {
  const m = mean(xs);
  if (!m) return 0;
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) / m;
};
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function prosody(pcm: Float32Array, sampleRate: number, words: number): Prosody {
  const rmsFrames = frameRms(pcm, sampleRate);
  const silence = 0.02;
  const voiced = rmsFrames.filter((r) => r >= silence);
  const n = Math.round(FRAME * sampleRate);
  const pitches: number[] = [];
  // Pitch on every 3rd voiced frame keeps this fast on long recordings.
  rmsFrames.forEach((r, i) => {
    if (r < silence || i % 3) return;
    const p = framePitch(pcm.subarray(i * n, i * n + n), sampleRate);
    if (p) pitches.push(p);
  });
  const seconds = pcm.length / sampleRate;
  const rms = mean(voiced);
  const rmsVar = cv(voiced);
  const pitchVar = cv(pitches);
  const wordsPerMin = seconds > 0 ? (words / seconds) * 60 : 0;
  const arousal = clamp01(
    0.35 * clamp01(rms / 0.25) +
      0.2 * clamp01(rmsVar / 1.0) +
      0.25 * clamp01(pitchVar / 0.35) +
      0.2 * clamp01((wordsPerMin - 90) / 110),
  );
  return {
    rms,
    rmsVar,
    pitchHz: median(pitches),
    pitchVar,
    pauseRatio: rmsFrames.length ? 1 - voiced.length / rmsFrames.length : 1,
    wordsPerMin,
    arousal: Math.round(arousal * 1000) / 1000,
  };
}
