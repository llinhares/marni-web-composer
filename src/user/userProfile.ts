/**
 * The person using the app: author name and (optional) BDO owner ID.
 *
 * Nothing is assumed: both start empty and are stored only when the user types a name or loads an
 * ID file from their own character. Values live in this browser only.
 */

const AUTHOR_KEY = 'marni_user_author';
const OWNER_ID_KEY = 'marni_user_owner_id';

// Earlier versions stored these under BDO-specific keys and also wrote hardcoded developer
// defaults on export. Those exact defaults are dropped instead of migrated.
const LEGACY_AUTHOR_KEY = 'marni_bdo_author';
const LEGACY_OWNER_ID_KEY = 'marni_bdo_owner_id';
const LEGACY_DEFAULT_AUTHOR = 'Tchepper';
const LEGACY_DEFAULT_OWNER_ID = '1009649';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const browserStore = (): KeyValueStore | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

/** One-time move of values saved by older versions, discarding the old built-in defaults. */
export function migrateLegacyProfile(store: KeyValueStore | null = browserStore()) {
  if (!store) return;
  try {
    const author = store.getItem(LEGACY_AUTHOR_KEY);
    const owner = store.getItem(LEGACY_OWNER_ID_KEY);
    if (author === null && owner === null) return;
    // The old defaults were written by the app itself, never chosen by the user
    const wasDefault = author === LEGACY_DEFAULT_AUTHOR && (owner === null || owner === LEGACY_DEFAULT_OWNER_ID);
    if (!wasDefault) {
      if (author && author.trim() && store.getItem(AUTHOR_KEY) === null) store.setItem(AUTHOR_KEY, author.trim());
      if (owner && owner !== LEGACY_DEFAULT_OWNER_ID && /^\d+$/.test(owner) && store.getItem(OWNER_ID_KEY) === null) {
        store.setItem(OWNER_ID_KEY, owner);
      }
    }
    store.removeItem(LEGACY_AUTHOR_KEY);
    store.removeItem(LEGACY_OWNER_ID_KEY);
  } catch {
    // storage unavailable: nothing to migrate
  }
}

export function getSavedAuthor(store: KeyValueStore | null = browserStore()): string {
  try {
    return store?.getItem(AUTHOR_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

/** Saves the name the user typed; an empty name forgets it. */
export function saveAuthor(name: string, store: KeyValueStore | null = browserStore()) {
  try {
    const clean = name.trim();
    if (clean) store?.setItem(AUTHOR_KEY, clean);
    else store?.removeItem(AUTHOR_KEY);
  } catch {
    // private mode: keep it for this session only
  }
}

/** BDO owner ID from the user's own character file, or null when none was loaded. */
export function getSavedOwnerId(store: KeyValueStore | null = browserStore()): number | null {
  try {
    const raw = store?.getItem(OWNER_ID_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function saveOwnerId(id: number | null, store: KeyValueStore | null = browserStore()) {
  try {
    if (id && id > 0) store?.setItem(OWNER_ID_KEY, String(id));
    else store?.removeItem(OWNER_ID_KEY);
  } catch {
    // ignore
  }
}
