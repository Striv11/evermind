/** Choosing the best still of the user's face from their video. */
export interface Pixels {
  data: Uint8ClampedArray; // RGBA
  width: number;
  height: number;
}

/** Variance of the Laplacian of luma: higher means sharper (less motion blur). */
export function sharpness({ data, width, height }: Pixels): number {
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++)
    luma[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * luma[i]! - luma[i - 1]! - luma[i + 1]! - luma[i - width]! - luma[i + width]!;
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  if (!n) return 0;
  const m = sum / n;
  return sumSq / n - m * m;
}

/** Mean luma 0..255; frames that are too dark or blown out are skipped. */
export function brightness({ data }: Pixels): number {
  let s = 0;
  for (let i = 0; i < data.length; i += 4)
    s += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  return s / (data.length / 4);
}

/** Sample frames across a video file and return the sharpest well-lit one as JPEG. */
export async function bestFrame(
  video: Blob,
  samples = 8,
): Promise<{ jpeg: Blob; preview: string }> {
  const url = URL.createObjectURL(video);
  const el = document.createElement('video');
  el.muted = true;
  el.playsInline = true;
  el.src = url;
  try {
    await new Promise<void>((ok, fail) => {
      el.onloadedmetadata = () => ok();
      el.onerror = () =>
        fail(new Error('This video could not be opened. Try an MP4 or WebM file.'));
    });
    const scale = Math.min(1, 1024 / Math.max(el.videoWidth, el.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(el.videoWidth * scale);
    canvas.height = Math.round(el.videoHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    let best = { score: -1, t: 0 };
    for (let k = 1; k <= samples; k++) {
      const t = (el.duration * k) / (samples + 1);
      el.currentTime = t;
      await new Promise<void>((ok) => (el.onseeked = () => ok()));
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const b = brightness(px);
      const score = b < 40 || b > 225 ? 0 : sharpness(px);
      if (score > best.score) best = { score, t };
    }
    el.currentTime = best.t;
    await new Promise<void>((ok) => (el.onseeked = () => ok()));
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob>((ok, fail) =>
      canvas.toBlob(
        (b) => (b ? ok(b) : fail(new Error('Could not capture a frame.'))),
        'image/jpeg',
        0.92,
      ),
    );
    return { jpeg, preview: URL.createObjectURL(jpeg) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
