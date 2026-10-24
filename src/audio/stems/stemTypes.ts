/** Shared between the stem separation module and its worker. */

export type StemName = 'vocals' | 'drums' | 'bass' | 'other';

export interface StereoStem {
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
}

export type Stems = Record<StemName, StereoStem>;

export interface StemWorkerRequest {
  model: ArrayBuffer;
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
}

export type StemWorkerMessage =
  | { type: 'progress'; progress: number }
  | { type: 'stage'; stage: string }
  | { type: 'done'; stems: Stems }
  | { type: 'error'; message: string };

export const ORT_WASM_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/';

/** HTDemucs exported to ONNX by the demucs-web project (MIT), hosted on Hugging Face. */
export const DEMUCS_MODEL_URL = 'https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx';
export const DEMUCS_SAMPLE_RATE = 44100;
