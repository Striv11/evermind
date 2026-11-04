/// <reference lib="webworker" />
/** On-device sentence embeddings (MiniLM via transformers.js) in a worker. */
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

export type EmbedIn = { type: 'embed'; id: number; texts: string[] };
export type EmbedOut =
  | { type: 'progress'; id: number; pct: number; detail?: string }
  | { type: 'result'; id: number; vectors: Float32Array[] }
  | { type: 'error'; id: number; message: string };

const MODEL = 'Xenova/all-MiniLM-L6-v2';
let extractor: Promise<FeatureExtractionPipeline> | null = null;
const post = (m: EmbedOut, transfer: Transferable[] = []) => self.postMessage(m, transfer);

self.onmessage = async (ev: MessageEvent<EmbedIn>) => {
  const { id, texts } = ev.data;
  try {
    extractor ??= pipeline('feature-extraction', MODEL, {
      dtype: 'q8',
      progress_callback: (p: { status: string; progress?: number; file?: string }) => {
        if (p.status === 'progress')
          post({ type: 'progress', id, pct: p.progress ?? 0, detail: p.file });
      },
    }) as Promise<FeatureExtractionPipeline>;
    const ex = await extractor;
    const vectors: Float32Array[] = [];
    const batch = 16;
    for (let i = 0; i < texts.length; i += batch) {
      const t = await ex(texts.slice(i, i + batch), { pooling: 'mean', normalize: true });
      const dim = t.dims[1]!;
      const data = t.data as Float32Array;
      for (let r = 0; r < t.dims[0]!; r++) vectors.push(data.slice(r * dim, (r + 1) * dim));
      post({ type: 'progress', id, pct: 100 * Math.min(1, (i + batch) / texts.length) });
    }
    post(
      { type: 'result', id, vectors },
      vectors.map((v) => v.buffer),
    );
  } catch (e) {
    extractor = null;
    post({ type: 'error', id, message: e instanceof Error ? e.message : String(e) });
  }
};
