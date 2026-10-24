/**
 * Web Worker that separates a song into stems with Demucs (HTDemucs, Meta, MIT) through ONNX Runtime
 * Web: WebGPU when the browser has it, WebAssembly otherwise. Runs off the main thread so the editor
 * stays responsive during the minutes a song takes.
 */

import * as ort from 'onnxruntime-web';
import { DemucsProcessor } from 'demucs-web';
import { ORT_WASM_CDN, type StemWorkerRequest, type StemWorkerMessage } from './stemTypes.ts';

// The runtime's WebAssembly files come from the CDN of the same version (keeps the app bundle small)
ort.env.wasm.wasmPaths = ORT_WASM_CDN;

const post = (msg: StemWorkerMessage, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (e: MessageEvent<StemWorkerRequest>) => {
  const { model, left, right } = e.data;
  try {
    const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
    const processor = new DemucsProcessor({
      ort,
      sessionOptions: { executionProviders: hasWebGpu ? ['webgpu', 'wasm'] : ['wasm'] },
      onProgress: ({ progress }) => post({ type: 'progress', progress }),
    });
    post({ type: 'stage', stage: hasWebGpu ? 'Preparando a separação (placa de vídeo)...' : 'Preparando a separação...' });
    await processor.loadModel(model);
    const result = await processor.separate(left, right);
    const stems = { drums: result.drums, bass: result.bass, other: result.other, vocals: result.vocals };
    const transfer = Object.values(stems).flatMap((s) => [s.left.buffer, s.right.buffer]);
    post({ type: 'done', stems }, transfer);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
