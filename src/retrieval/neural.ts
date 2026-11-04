import type { EmbedIn, EmbedOut } from './embed.worker';
import type { Embedder, EmbedProgress } from './embed';

/** all-MiniLM-L6-v2 in a Web Worker. First use downloads ~23 MB, then the browser caches it. */
export class NeuralEmbedder implements Embedder {
  readonly name = 'minilm-l6-v2-q8';
  readonly dim = 384;
  private worker: Worker | null = null;
  private nextId = 1;

  embed(texts: string[], onProgress: EmbedProgress = () => {}): Promise<Float32Array[]> {
    this.worker ??= new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
    const w = this.worker;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const onMsg = (ev: MessageEvent<EmbedOut>) => {
        const m = ev.data;
        if (m.id !== id) return;
        if (m.type === 'progress') return onProgress(m.pct, m.detail);
        w.removeEventListener('message', onMsg);
        if (m.type === 'result') resolve(m.vectors);
        else reject(new Error(m.message));
      };
      w.addEventListener('message', onMsg);
      w.postMessage({ type: 'embed', id, texts } satisfies EmbedIn);
    });
  }
}
