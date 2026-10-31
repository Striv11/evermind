import type { TranscriptChunk } from '../insight/pipeline';
import type { WorkerIn, WorkerOut } from './whisper.worker';

export type Progress = (stage: 'download' | 'transcribe', pct: number) => void;

let worker: Worker | null = null;
let nextId = 1;

/** Transcribe 16 kHz mono PCM on this device. The first call downloads the model (~80 MB). */
export function transcribe(
  pcm: Float32Array,
  onProgress: Progress,
  language?: string,
): Promise<TranscriptChunk[]> {
  worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMsg = (ev: MessageEvent<WorkerOut>) => {
      const m = ev.data;
      if (m.id !== id) return;
      if (m.type === 'progress') onProgress(m.stage, m.pct);
      else {
        w.removeEventListener('message', onMsg);
        if (m.type === 'result') resolve(m.chunks);
        else reject(new Error(m.message));
      }
    };
    w.addEventListener('message', onMsg);
    w.postMessage({
      type: 'transcribe',
      id,
      pcm,
      ...(language ? { language } : {}),
    } satisfies WorkerIn);
  });
}
