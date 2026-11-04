// store.js: a tiny IndexedDB wrapper. All data stays on this device.
//
// Why IndexedDB: an installed Home Screen web app has its own storage,
// separate from Safari, and WebKit does not expect to evict it. IndexedDB is
// async and structured. navigator.storage.persist() asks iOS to keep it.
// If IndexedDB is unavailable (rare: some private modes), we fall back to
// localStorage with the same interface.

export const SCHEMA_VERSION = 1;
const DB_NAME = 'lean-split';
const DB_VERSION = 1;
export const STORES = ['kv', 'sessions', 'cardio', 'body'];

function req2promise(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

function openIDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');            // key -> value
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('cardio')) db.createObjectStore('cardio', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('body')) db.createObjectStore('body', { keyPath: 'date' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('indexedDB blocked'));
  });
}

class IDBStore {
  constructor(db) { this.db = db; this.kind = 'indexeddb'; }
  tx(store, mode = 'readonly') { return this.db.transaction(store, mode).objectStore(store); }
  getAll(store) { return req2promise(this.tx(store).getAll()); }
  get(store, key) { return req2promise(this.tx(store).get(key)); }
  put(store, value, key) {
    const os = this.tx(store, 'readwrite');
    return req2promise(store === 'kv' ? os.put(value, key) : os.put(value));
  }
  delete(store, key) { return req2promise(this.tx(store, 'readwrite').delete(key)); }
  clear(store) { return req2promise(this.tx(store, 'readwrite').clear()); }
  /** Replace a whole store's contents in one transaction. */
  replaceAll(store, items) {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(store, 'readwrite');
      const os = t.objectStore(store);
      os.clear();
      for (const it of items) os.put(it);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }
}

/** Fallback with the same API, one JSON blob per store in localStorage. */
class LocalStore {
  constructor() { this.kind = 'localstorage'; }
  read(store) { try { return JSON.parse(localStorage.getItem(`lean-split:${store}`)) || {}; } catch { return {}; } }
  write(store, obj) { localStorage.setItem(`lean-split:${store}`, JSON.stringify(obj)); }
  keyOf(store, v) { return store === 'body' ? v.date : v.id; }
  async getAll(store) { return Object.values(this.read(store)); }
  async get(store, key) { return this.read(store)[key]; }
  async put(store, value, key) { const o = this.read(store); o[store === 'kv' ? key : this.keyOf(store, value)] = value; this.write(store, o); }
  async delete(store, key) { const o = this.read(store); delete o[key]; this.write(store, o); }
  async clear(store) { this.write(store, {}); }
  async replaceAll(store, items) { const o = {}; for (const it of items) o[this.keyOf(store, it)] = it; this.write(store, o); }
}

export async function openStore() {
  try { return new IDBStore(await openIDB()); }
  catch (e) { console.warn('IndexedDB unavailable, using localStorage', e); return new LocalStore(); }
}

/** Ask the browser to keep our data (granted by heuristics on iOS,
 *  more likely for Home Screen apps). Returns true/false/null. */
export async function requestPersist() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}
