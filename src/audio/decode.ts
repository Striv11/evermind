/** Decode any browser-supported audio or video file to 16 kHz mono PCM. */
export const SAMPLE_RATE = 16000;

export async function decodeToMono16k(file: Blob): Promise<Float32Array> {
  const bytes = await file.arrayBuffer();
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes);
  } catch {
    throw new Error(
      'This file could not be decoded. Try MP3, M4A, WAV, OGG, WebM or an MP4 video with sound.',
    );
  } finally {
    void ctx.close();
  }
  const frames = Math.ceil(decoded.duration * SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded; // multi-channel input is down-mixed to the mono destination
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

/** Record from the microphone until `stop()` is called. */
export async function recordMic(): Promise<{ stop: () => Promise<Blob> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => parts.push(e.data);
  rec.start(1000);
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(parts, { type: rec.mimeType }));
        };
        rec.stop();
      }),
  };
}
