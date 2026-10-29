// 저장소: 채점 표시·설정은 localStorage, 손글씨 획은 IndexedDB에 둔다.

const MARKS_KEY = 'evalue.marks.v1';
const SETTINGS_KEY = 'evalue.settings.v1';
const UI_KEY = 'evalue.ui.v1';

const DEFAULT_SETTINGS = {
  input: 'auto', // auto: 펜이 감지되면 손가락 무시 / pen: 펜만 / all: 손가락도 필기
  width: 3,      // 기본 펜 굵기(px)
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간이 없거나 막혀 있어도 앱은 계속 동작한다.
  }
}

let settings = { ...DEFAULT_SETTINGS, ...load(SETTINGS_KEY, {}) };
let marks = load(MARKS_KEY, {});

export function getSettings() {
  return settings;
}

export function setSetting(key, value) {
  settings = { ...settings, [key]: value };
  save(SETTINGS_KEY, settings);
}

export function getUi(key, fallback) {
  return load(UI_KEY, {})[key] ?? fallback;
}

export function setUi(key, value) {
  save(UI_KEY, { ...load(UI_KEY, {}), [key]: value });
}

// 채점 표시: 'o'(맞음) | 't'(애매함) | 'x'(틀림)
export function getMark(sheetId, itemId) {
  return marks[sheetId]?.[itemId] ?? null;
}

export function setMark(sheetId, itemId, value) {
  const sheet = { ...(marks[sheetId] ?? {}) };
  if (value) sheet[itemId] = value;
  else delete sheet[itemId];
  marks = { ...marks, [sheetId]: sheet };
  save(MARKS_KEY, marks);
}

export function marksFor(sheetId) {
  return marks[sheetId] ?? {};
}

export function allMarks() {
  return marks;
}

export function clearMarks(sheetId) {
  marks = { ...marks };
  delete marks[sheetId];
  save(MARKS_KEY, marks);
}

export function clearAllMarks() {
  marks = {};
  save(MARKS_KEY, marks);
}

// --- 손글씨(IndexedDB) ---

let dbPromise;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('evalue', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('ink');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const tx = d.transaction('ink', mode);
    const req = fn(tx.objectStore('ink'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  }));
}

export async function loadInk(key) {
  try {
    return (await run('readonly', (s) => s.get(key))) ?? [];
  } catch {
    return [];
  }
}

export function saveInk(key, strokes) {
  return run('readwrite', (s) => (strokes.length ? s.put(strokes, key) : s.delete(key))).catch(() => {});
}

export function clearInk(prefix = '') {
  return run('readwrite', (s) => s.delete(IDBKeyRange.bound(prefix, prefix + '￿'))).catch(() => {});
}
