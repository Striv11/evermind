/// <reference lib="webworker" />
/**
 * On-device speech recognition (Whisper via transformers.js). Runs in a worker so
 * the UI stays responsive; the model is downloaded once and cached by the browser.
 */
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

export type WorkerIn = { type: 'transcribe'; id: number; pcm: Float32Array; language?: string };
export type WorkerOut =
  | { type: 'progress'; id: number; stage: 'download' | 'transcribe'; pct: number; detail?: string }
  | { type: 'result'; id: number; chunks: { text: string; start: number; end: number }[] }
  | { type: 'error'; id: number; message: string };

const MODEL = 'onnx-community/whisper-base';
let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

/** `navigator.gpu` existing does not mean an adapter is available; ask for one. */
async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

function load(id: number): Promise<AutomaticSpeechRecognitionPipeline> {
  const post = (m: WorkerOut) => self.postMessage(m);
  const make = (device: 'webgpu' | 'wasm') =>
    pipeline('automatic-speech-recognition', MODEL, {
      device,
      dtype: device === 'webgpu' ? 'fp32' : 'q8',
      progress_callback: (p: { status: string; progress?: number; file?: string }) => {
        if (p.status === 'progress')
          post({ type: 'progress', id, stage: 'download', pct: p.progress ?? 0, detail: p.file });
      },
    }) as Promise<AutomaticSpeechRecognitionPipeline>;
  // WebGPU is much faster when it works; any failure falls back to the CPU (WASM).
  asr ??= hasWebGpu().then((gpu) =>
    gpu ? make('webgpu').catch(() => make('wasm')) : make('wasm'),
  );
  return asr;
}

self.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const { id, pcm, language } = ev.data;
  try {
    const model = await load(id);
    self.postMessage({ type: 'progress', id, stage: 'transcribe', pct: 0 } satisfies WorkerOut);
    const out = (await model(pcm, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(language ? { language } : {}),
    })) as { text: string; chunks?: { text: string; timestamp: [number, number | null] }[] };
    const total = pcm.length / 16000;
    const chunks = (out.chunks ?? [{ text: out.text, timestamp: [0, total] }]).map((c) => ({
      text: c.text,
      start: c.timestamp[0],
      end: c.timestamp[1] ?? total,
    }));
    self.postMessage({ type: 'result', id, chunks } satisfies WorkerOut);
  } catch (e) {
    asr = null;
    self.postMessage({
      type: 'error',
      id,
      message: String((e as Error).message ?? e),
    } satisfies WorkerOut);
  }
};
