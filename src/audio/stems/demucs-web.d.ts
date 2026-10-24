// Types for demucs-web (MIT, https://github.com/timcsy/demucs-web), which ships plain JavaScript.
declare module 'demucs-web' {
  export interface StereoStem {
    left: Float32Array<ArrayBuffer>;
    right: Float32Array<ArrayBuffer>;
  }
  export interface SeparationResult {
    drums: StereoStem;
    bass: StereoStem;
    other: StereoStem;
    vocals: StereoStem;
  }
  export interface ProgressInfo {
    progress: number;
    currentSegment: number;
    totalSegments: number;
  }
  export class DemucsProcessor {
    constructor(options: {
      ort: unknown;
      sessionOptions?: Record<string, unknown>;
      onProgress?: (info: ProgressInfo) => void;
      onLog?: (phase: string, message: string) => void;
      onDownloadProgress?: (loaded: number, total: number) => void;
    });
    loadModel(pathOrBuffer?: string | ArrayBuffer): Promise<unknown>;
    separate(left: Float32Array, right: Float32Array): Promise<SeparationResult>;
  }
  export const CONSTANTS: {
    SAMPLE_RATE: number;
    TRACKS: string[];
    DEFAULT_MODEL_URL: string;
  };
}
