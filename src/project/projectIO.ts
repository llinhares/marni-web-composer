/**
 * Marni Web Composer - Project file I/O in the browser.
 *
 * Uses the File System Access API (Chrome/Edge) so "Salvar" writes back to the same .marni file,
 * like a desktop DAW. Other browsers fall back to downloading the file.
 */

import { PROJECT_EXTENSION, PROJECT_MIME } from './projectFile.ts';

interface WritableLike {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}
export interface FileHandleLike {
  name: string;
  createWritable(): Promise<WritableLike>;
  getFile(): Promise<File>;
}
type PickerWindow = Window & {
  showSaveFilePicker?: (opts: unknown) => Promise<FileHandleLike>;
  showOpenFilePicker?: (opts: unknown) => Promise<FileHandleLike[]>;
};

const PICKER_TYPES = [
  {
    description: 'Projeto Marni Web Composer',
    accept: { [PROJECT_MIME]: [PROJECT_EXTENSION] },
  },
];

export const supportsFileSystemAccess = (): boolean =>
  typeof window !== 'undefined' && typeof (window as PickerWindow).showSaveFilePicker === 'function';

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

/**
 * Saves the project. With a handle, overwrites that file; with `forcePicker` (Salvar como) or no
 * handle, asks where to save. Returns the handle used (null on download fallback) or 'cancelled'.
 */
export async function saveProjectToDisk(
  json: string,
  suggestedName: string,
  handle: FileHandleLike | null,
  forcePicker = false
): Promise<FileHandleLike | null | 'cancelled'> {
  if (supportsFileSystemAccess()) {
    try {
      let target = handle;
      if (!target || forcePicker) {
        target = await (window as PickerWindow).showSaveFilePicker!({ suggestedName, types: PICKER_TYPES });
      }
      const writable = await target.createWritable();
      await writable.write(new Blob([json], { type: PROJECT_MIME }));
      await writable.close();
      return target;
    } catch (err) {
      if (isAbort(err)) return 'cancelled';
      throw err;
    }
  }

  const url = URL.createObjectURL(new Blob([json], { type: PROJECT_MIME }));
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return null;
}

/** Opens a .marni file with the native picker. Returns null when unsupported or cancelled. */
export async function pickProjectFile(): Promise<{ text: string; handle: FileHandleLike } | null | 'unsupported'> {
  const w = window as PickerWindow;
  if (typeof w.showOpenFilePicker !== 'function') return 'unsupported';
  try {
    const [handle] = await w.showOpenFilePicker({ types: PICKER_TYPES, multiple: false });
    const file = await handle.getFile();
    return { text: await file.text(), handle };
  } catch (err) {
    if (isAbort(err)) return null;
    throw err;
  }
}
