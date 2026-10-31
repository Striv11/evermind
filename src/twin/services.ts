/**
 * Clients for the two cloud services the user chose for the "digital me":
 * ElevenLabs (voice clone + speech) and D-ID (talking video from one photo).
 * Both allow direct browser calls (CORS), so keys go straight from this tab to
 * the provider and never through any server of ours. Keys are held in memory
 * only. `fetchFn` is injectable for tests.
 */
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export class ServiceError extends Error {
  constructor(
    public readonly service: 'elevenlabs' | 'd-id',
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

async function check(service: ServiceError['service'], res: Response): Promise<Response> {
  if (res.ok) return res;
  let detail = '';
  try {
    const body = (await res.json()) as Record<string, unknown>;
    const d = body['detail'] ?? body['description'] ?? body['message'] ?? body['kind'];
    detail = typeof d === 'string' ? d : JSON.stringify(d);
  } catch {
    /* non-JSON error body */
  }
  const hint =
    res.status === 401 || res.status === 403
      ? 'the API key was rejected or lacks permission'
      : res.status === 402
        ? 'the account needs credits or a paid plan for this'
        : res.status === 429
          ? 'rate limited; wait a minute and retry'
          : `HTTP ${res.status}`;
  throw new ServiceError(service, res.status, `${service}: ${hint}${detail ? ` (${detail})` : ''}`);
}

const ELEVEN = 'https://api.elevenlabs.io/v1';

export class ElevenLabs {
  constructor(
    private readonly key: string,
    private readonly fetchFn: Fetch = fetch.bind(globalThis),
  ) {}

  /** Instant voice clone from the user's own recordings. Returns the new voice id. */
  async cloneVoice(name: string, samples: Blob[], description: string): Promise<string> {
    if (!samples.length) throw new Error('Add at least one recording of your voice.');
    const form = new FormData();
    form.append('name', name);
    form.append('description', description);
    form.append('remove_background_noise', 'true');
    samples.forEach((s, i) => form.append('files', s, `sample-${i + 1}.${ext(s.type)}`));
    const res = await check(
      'elevenlabs',
      await this.fetchFn(`${ELEVEN}/voices/add`, {
        method: 'POST',
        headers: { 'xi-api-key': this.key },
        body: form,
      }),
    );
    const body = (await res.json()) as { voice_id?: string };
    if (!body.voice_id)
      throw new ServiceError('elevenlabs', 200, 'elevenlabs: no voice_id returned');
    return body.voice_id;
  }

  async speak(voiceId: string, text: string): Promise<Blob> {
    const res = await check(
      'elevenlabs',
      await this.fetchFn(
        `${ELEVEN}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': this.key, 'content-type': 'application/json' },
          body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
        },
      ),
    );
    return res.blob();
  }
}

const DID = 'https://api.d-id.com';

export type TalkStatus = 'created' | 'started' | 'done' | 'error' | 'rejected';

export class DId {
  constructor(
    private readonly key: string,
    private readonly fetchFn: Fetch = fetch.bind(globalThis),
    private readonly sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private auth() {
    // D-ID issues keys already in "Basic" credential form.
    return { authorization: `Basic ${this.key}` };
  }

  private async upload(path: 'images' | 'audios', field: string, blob: Blob, name: string) {
    const form = new FormData();
    form.append(field, blob, name);
    const res = await check(
      'd-id',
      await this.fetchFn(`${DID}/${path}`, { method: 'POST', headers: this.auth(), body: form }),
    );
    const body = (await res.json()) as { url?: string };
    if (!body.url) throw new ServiceError('d-id', 200, `d-id: upload to /${path} returned no url`);
    return body.url;
  }

  /** Photo + speech audio -> URL of an MP4 of that face speaking. Polls until done. */
  async talkingVideo(
    face: Blob,
    speech: Blob,
    onStatus: (s: TalkStatus) => void = () => {},
    timeoutMs = 180_000,
  ): Promise<string> {
    const sourceUrl = await this.upload('images', 'image', face, 'face.jpg');
    const audioUrl = await this.upload('audios', 'audio', speech, 'speech.mp3');
    const created = await check(
      'd-id',
      await this.fetchFn(`${DID}/talks`, {
        method: 'POST',
        headers: { ...this.auth(), 'content-type': 'application/json' },
        body: JSON.stringify({
          source_url: sourceUrl,
          script: { type: 'audio', audio_url: audioUrl },
          config: { stitch: true },
        }),
      }),
    );
    const { id } = (await created.json()) as { id: string };
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await check(
        'd-id',
        await this.fetchFn(`${DID}/talks/${encodeURIComponent(id)}`, { headers: this.auth() }),
      );
      const t = (await res.json()) as { status: TalkStatus; result_url?: string; error?: unknown };
      onStatus(t.status);
      if (t.status === 'done' && t.result_url) return t.result_url;
      if (t.status === 'error' || t.status === 'rejected')
        throw new ServiceError(
          'd-id',
          200,
          `d-id: video ${t.status} ${JSON.stringify(t.error ?? '')}`,
        );
      await this.sleep(2000);
    }
    throw new ServiceError('d-id', 0, 'd-id: timed out waiting for the video');
  }
}

function ext(mime: string): string {
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  return 'webm';
}
