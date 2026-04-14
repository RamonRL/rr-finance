import { useState, useEffect, useCallback, useRef } from 'react';
import { getStore, setStore } from '../api/store';

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function readLocalStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Drop-in replacement for useState + localStorage.
 * Load order:
 *   1. Backend store (Neon via /store/:key)
 *   2. If backend is empty → localStorage (and push it to backend so future loads are fast)
 *   3. If both empty → fallback value
 */
export function useStore(key, fallback) {
  const [value, setValue] = useState(fallback);
  const [loading, setLoading] = useState(true);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getStore(key, null).then(remote => {
      if (cancelled) return;

      if (!isEmpty(remote)) {
        // Backend has data — use it
        setValue(remote);
        setLoading(false);
        return;
      }

      // Backend empty — try localStorage
      const local = readLocalStorage(key, null);
      if (!isEmpty(local)) {
        setValue(local);
        setStore(key, local); // push to backend (fire and forget)
        console.log(`[RR Finance] migrated "${key}" from localStorage to backend`);
      } else {
        setValue(fallback);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((newValue) => {
    setValue(newValue);
    setStore(keyRef.current, newValue);
  }, []);

  return [value, persist, loading];
}
