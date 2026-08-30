// IndexedDB, kept deliberately dull.
//
// Everything that could be wrong about saving is decided in `saves.js`, which
// is pure and tested. This is the part a test cannot reach without a browser,
// so it does as little as possible: one store, keyed by slot, holding
// `{ slot, savedAt, summary, save }`.
//
// Every call resolves rather than rejects. A browser in private mode, with
// storage disabled, or out of quota, must degrade to "saving is unavailable"
// and never take the game down with it — a city you cannot save is still a
// city you can play.

const DB = "citygrid";
const STORE = "saves";
const VERSION = 1;

let opening;

function open() {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    if (!globalThis.indexedDB) return resolve(undefined);
    let request;
    try {
      request = indexedDB.open(DB, VERSION);
    } catch {
      return resolve(undefined);
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "slot" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
  });
  return opening;
}

function run(mode, work) {
  return open().then((db) => {
    if (!db) return undefined;
    return new Promise((resolve) => {
      let tx;
      try {
        tx = db.transaction(STORE, mode);
      } catch {
        return resolve(undefined);
      }
      const request = work(tx.objectStore(STORE));
      tx.onabort = () => resolve(undefined);
      tx.onerror = () => resolve(undefined);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    });
  });
}

export function available() {
  return open().then((db) => db !== undefined);
}

export function putSave(record) {
  return run("readwrite", (store) => store.put(record));
}

export function getSave(slot) {
  return run("readonly", (store) => store.get(slot));
}

export function listSaves() {
  return run("readonly", (store) => store.getAll()).then((rows) => rows ?? []);
}

export function deleteSave(slot) {
  return run("readwrite", (store) => store.delete(slot));
}
