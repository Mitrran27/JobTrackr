// Tiny stale-while-revalidate cache so pages can show the last known data instantly
const PREFIX = 'jt_cache_';

export function readCache(key) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export function writeCache(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the page still works without it */
  }
}

export function clearCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
