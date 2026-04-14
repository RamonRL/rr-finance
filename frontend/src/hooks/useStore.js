import { useState, useEffect, useCallback, useRef } from 'react';
import { getStore, setStore } from '../api/store';

/**
 * Async drop-in replacement for useState + localStorage.
 * Loads the value from the backend store on mount.
 * Returns [value, persist, loading] where persist(newValue) updates state + saves to backend.
 */
export function useStore(key, fallback) {
  const [value, setValue] = useState(fallback);
  const [loading, setLoading] = useState(true);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStore(key, fallback).then(v => {
      if (!cancelled) {
        setValue(v);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [key]); // key is a constant string — runs once on mount

  const persist = useCallback((newValue) => {
    setValue(newValue);
    setStore(keyRef.current, newValue);
  }, []);

  return [value, persist, loading];
}
