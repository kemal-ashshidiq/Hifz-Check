// Runs Tarteel's Quran Whisper model (tiny, 8-bit ONNX) in the browser, off the main thread.
// In: { id, audio: Float32Array at 16 kHz }. Out: progress / ready / error / { type: 'result', id, text }.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1';

env.allowRemoteModels = false; // the model ships with the site, under ./models/
env.allowLocalModels = true; // off by default in browsers
env.localModelPath = new URL('./models/', self.location.href).href;

let asr = null;
const ready = pipeline('automatic-speech-recognition', 'whisper-tiny-ar-quran', {
  dtype: 'q8',
  progress_callback: (p) => { if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total }); },
})
  .then((a) => { asr = a; self.postMessage({ type: 'ready' }); })
  .catch((e) => self.postMessage({ type: 'error', message: String(e && e.message || e) }));

self.onmessage = async ({ data }) => {
  await ready;
  let text = '';
  if (asr) {
    try { text = (await asr(data.audio)).text.trim(); } catch (e) { /* unreadable clip: treat as silence */ }
  }
  self.postMessage({ type: 'result', id: data.id, text });
};
