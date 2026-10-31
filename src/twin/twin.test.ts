import { describe, expect, it, vi } from 'vitest';
import { brightness, sharpness } from './frame';
import { DId, ElevenLabs, ServiceError } from './services';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('ElevenLabs', () => {
  it('clones a voice with the key header and every sample', async () => {
    const f = vi.fn(async () => json({ voice_id: 'v123' }));
    const id = await new ElevenLabs('k', f).cloneVoice(
      'Me',
      [new Blob(['a'], { type: 'audio/mpeg' }), new Blob(['b'], { type: 'audio/webm' })],
      'mine',
    );
    expect(id).toBe('v123');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/voices/add');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('k');
    expect((init.body as FormData).getAll('files')).toHaveLength(2);
  });
  it('explains auth and billing errors', async () => {
    const e = new ElevenLabs('bad', async () => json({ detail: { message: 'invalid' } }, 401));
    await expect(e.speak('v', 'hi')).rejects.toThrow(/key was rejected/);
    const p = new ElevenLabs('k', async () => json({ detail: 'upgrade' }, 402));
    await expect(p.cloneVoice('Me', [new Blob(['a'])], '')).rejects.toBeInstanceOf(ServiceError);
  });
  it('refuses to clone with no samples', async () => {
    await expect(new ElevenLabs('k', vi.fn()).cloneVoice('Me', [], '')).rejects.toThrow(
      /at least one/,
    );
  });
});

describe('D-ID', () => {
  it('uploads, creates a talk and polls until done', async () => {
    const statuses = ['created', 'started', 'done'];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['authorization']).toBe('Basic key');
      if (url.endsWith('/images')) return json({ url: 's3://img' });
      if (url.endsWith('/audios')) return json({ url: 's3://aud' });
      if (url.endsWith('/talks')) {
        const body = JSON.parse(init!.body as string);
        expect(body).toMatchObject({ source_url: 's3://img', script: { audio_url: 's3://aud' } });
        return json({ id: 'tlk_1' });
      }
      const status = statuses.shift();
      return json({ status, ...(status === 'done' ? { result_url: 'https://v/out.mp4' } : {}) });
    });
    const seen: string[] = [];
    const url = await new DId('key', f, async () => {}).talkingVideo(
      new Blob(['i']),
      new Blob(['a']),
      (s) => seen.push(s),
    );
    expect(url).toBe('https://v/out.mp4');
    expect(seen).toEqual(['created', 'started', 'done']);
  });
  it('surfaces rejected videos', async () => {
    const f = async (url: string) =>
      url.match(/images|audios/)
        ? json({ url: 'u' })
        : url.endsWith('/talks')
          ? json({ id: 't' })
          : json({ status: 'rejected', error: 'no face' });
    await expect(
      new DId('k', f, async () => {}).talkingVideo(new Blob(), new Blob()),
    ).rejects.toThrow(/rejected/);
  });
});

describe('frame selection', () => {
  const img = (w: number, h: number, f: (x: number, y: number) => number) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = f(x, y);
        data.set([v, v, v, 255], (y * w + x) * 4);
      }
    return { data, width: w, height: h };
  };
  it('prefers sharp frames over blurry ones', () => {
    const sharp = img(32, 32, (x, y) => ((x + y) % 2 ? 220 : 30));
    const blurry = img(32, 32, (x) => 100 + x);
    expect(sharpness(sharp)).toBeGreaterThan(sharpness(blurry) * 100);
  });
  it('measures brightness', () => {
    expect(brightness(img(4, 4, () => 0))).toBe(0);
    expect(brightness(img(4, 4, () => 200))).toBeCloseTo(200, 0);
  });
});
