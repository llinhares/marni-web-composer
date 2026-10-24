/**
 * Splits a song into four stems (vocals, drums, bass, other) in the browser.
 *
 * The HTDemucs model (~180 MB) is downloaded once and kept in Cache Storage, so later separations
 * start right away and work offline. The heavy work runs in a Web Worker (see stemWorker.ts).
 */

import {
  DEMUCS_MODEL_URL,
  DEMUCS_SAMPLE_RATE,
  type Stems,
  type StemWorkerMessage,
  type StemWorkerRequest,
} from './stemTypes.ts';

const MODEL_CACHE = 'marni-ai-models-v1';

export interface SeparationProgress {
  /** 0..1 inside the current stage. */
  progress: number;
  stage: string;
}

async function readWithProgress(response: Response, onProgress: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const total = Number(response.headers.get('Content-Length')) || 0;
  if (!response.body) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out.buffer;
}

/** True when the model is already in the browser cache (no download needed). */
export async function isStemModelCached(): Promise<boolean> {
  try {
    const cache = await caches.open(MODEL_CACHE);
    return Boolean(await cache.match(DEMUCS_MODEL_URL));
  } catch {
    return false;
  }
}

/** The model bytes, from the cache or downloaded (and cached) with progress. */
export async function loadStemModel(onProgress?: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(MODEL_CACHE);
    const hit = await cache.match(DEMUCS_MODEL_URL);
    if (hit) return hit.arrayBuffer();
  } catch {
    cache = null; // private mode or storage blocked: download every time
  }
  const response = await fetch(DEMUCS_MODEL_URL);
  if (!response.ok) throw new Error(`Não foi possível baixar o modelo de separação (HTTP ${response.status}).`);
  const buffer = await readWithProgress(response, (l, t) => onProgress?.(l, t || 181_000_000));
  if (cache) {
    try {
      await cache.put(DEMUCS_MODEL_URL, new Response(buffer.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } }));
    } catch {
      // Not enough storage: the separation still works, the model is downloaded again next time
    }
  }
  return buffer;
}

/** Stereo 44.1 kHz channels of the [start, end] range of an AudioBuffer (the rate Demucs was trained on). */
export async function toDemucsInput(audio: AudioBuffer, startSec = 0, endSec?: number): Promise<{ left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer> }> {
  const start = Math.max(0, startSec);
  const end = endSec && endSec > start ? Math.min(audio.duration, endSec) : audio.duration;
  const length = Math.max(1, Math.ceil((end - start) * DEMUCS_SAMPLE_RATE));
  const offline = new OfflineAudioContext(2, length, DEMUCS_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = audio;
  src.connect(offline.destination);
  src.start(0, start, end - start);
  const rendered = await offline.startRendering();
  return { left: rendered.getChannelData(0).slice(), right: rendered.getChannelData(rendered.numberOfChannels > 1 ? 1 : 0).slice() };
}

/**
 * Separates the stereo input into vocals, drums, bass and other. Rejects with an AbortError when
 * `signal` is aborted (the worker is terminated at once).
 */
export async function separateStems(
  input: { left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer> },
  opts: { onProgress?: (p: SeparationProgress) => void; signal?: AbortSignal } = {}
): Promise<Stems> {
  const { onProgress, signal } = opts;
  const cached = await isStemModelCached();
  onProgress?.({ progress: 0, stage: cached ? 'Carregando o modelo de separação...' : 'Baixando o modelo de separação (180 MB, só na primeira vez)...' });
  const model = await loadStemModel((loaded, total) =>
    onProgress?.({
      progress: Math.min(1, loaded / total),
      stage: `Baixando o modelo de separação (${Math.round(loaded / 1e6)} de ${Math.round(total / 1e6)} MB, só na primeira vez)...`,
    })
  );
  if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');

  const worker = new Worker(new URL('./stemWorker.ts', import.meta.url), { type: 'module' });
  return new Promise<Stems>((resolve, reject) => {
    const stop = () => {
      worker.terminate();
      reject(new DOMException('Cancelado', 'AbortError'));
    };
    signal?.addEventListener('abort', stop, { once: true });
    worker.onmessage = (e: MessageEvent<StemWorkerMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') onProgress?.({ progress: msg.progress, stage: `Separando voz, bateria, baixo e outros (${Math.round(msg.progress * 100)}%)...` });
      else if (msg.type === 'stage') onProgress?.({ progress: 0, stage: msg.stage });
      else {
        signal?.removeEventListener('abort', stop);
        worker.terminate();
        if (msg.type === 'done') resolve(msg.stems);
        else reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      signal?.removeEventListener('abort', stop);
      worker.terminate();
      reject(new Error(e.message || 'Falha no processamento da separação.'));
    };
    const request: StemWorkerRequest = { model, left: input.left, right: input.right };
    worker.postMessage(request, [model, input.left.buffer, input.right.buffer]);
  });
}
