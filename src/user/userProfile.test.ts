import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSavedAuthor,
  getSavedOwnerId,
  migrateLegacyProfile,
  saveAuthor,
  saveOwnerId,
  type KeyValueStore,
} from './userProfile.ts';

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
};

test('a new user has no name and no owner ID', () => {
  const store = memoryStore();
  assert.equal(getSavedAuthor(store), '');
  assert.equal(getSavedOwnerId(store), null);
});

test('only what the user informs is saved; clearing the name forgets it', () => {
  const store = memoryStore();
  saveAuthor('  Aria  ', store);
  saveOwnerId(4242, store);
  assert.equal(getSavedAuthor(store), 'Aria');
  assert.equal(getSavedOwnerId(store), 4242);
  saveAuthor('', store);
  saveOwnerId(null, store);
  assert.deepEqual(store.data, {});
});

test('legacy values chosen by the user are migrated', () => {
  const store = memoryStore({ marni_bdo_author: 'Aria', marni_bdo_owner_id: '777' });
  migrateLegacyProfile(store);
  assert.equal(getSavedAuthor(store), 'Aria');
  assert.equal(getSavedOwnerId(store), 777);
  assert.equal(store.getItem('marni_bdo_author'), null, 'Legacy keys are removed');
});

test('the old built-in developer defaults are discarded instead of migrated', () => {
  const store = memoryStore({ marni_bdo_author: 'Tchepper', marni_bdo_owner_id: '1009649' });
  migrateLegacyProfile(store);
  assert.deepEqual(store.data, {});
});

test('a real name with the old default ID keeps the name but not the ID', () => {
  const store = memoryStore({ marni_bdo_author: 'Aria', marni_bdo_owner_id: '1009649' });
  migrateLegacyProfile(store);
  assert.equal(getSavedAuthor(store), 'Aria');
  assert.equal(getSavedOwnerId(store), null);
});
