import { API_URL } from '../constants';

export async function getStore(key, fallback = null) {
  try {
    const res = await fetch(`${API_URL}/store/${encodeURIComponent(key)}`);
    if (res.status === 404) return fallback;
    if (!res.ok) return fallback;
    const data = await res.json();
    return data.value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setStore(key, value) {
  try {
    await fetch(`${API_URL}/store/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
  } catch { /* ignore — state already updated in memory */ }
}
