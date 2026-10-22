/**
 * Marni Web Composer - IndexedDB autosave / crash recovery
 *
 * Keeps one rolling snapshot of the session in IndexedDB (survives reloads, crashes and closed tabs).
 * IndexedDB is used instead of localStorage because projects with thousands of notes exceed its quota
 * and because writes are asynchronous (no frame drops while editing).
 */

import { parseProjectFile, type ProjectFile } from './projectFile.ts';

const DB_NAME = 'marni-web-composer';
const DB_VERSION = 1;
const STORE = 'autosave';
const KEY = 'current';

export interface AutosaveRecord {
  savedAt: string; // ISO timestamp
  signature: string; // content fingerprint (projectSignature)
  json: string; // serialized ProjectFile
  isDirty: boolean; // had changes not written to a .marni file when autosaved
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB indisponível'));
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba'));
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error('Transação abortada'));
      })
  );
}

export function writeAutosave(record: AutosaveRecord): Promise<void> {
  return run('readwrite', (s) => s.put(record, KEY)).then(() => undefined);
}

export async function readAutosave(): Promise<{ record: AutosaveRecord; project: ProjectFile } | null> {
  const record = await run<AutosaveRecord | undefined>('readonly', (s) => s.get(KEY));
  if (!record || typeof record.json !== 'string') return null;
  try {
    return { record, project: parseProjectFile(record.json) };
  } catch {
    return null; // unreadable snapshot: ignore instead of blocking startup
  }
}

export function clearAutosave(): Promise<void> {
  return run('readwrite', (s) => s.delete(KEY)).then(() => undefined);
}
