import { emptyChunk, mapVersion, setMapLoader, storeChunk } from '../game/region';

export function useBrowserMap() {
  const pending = new Set<string>();
  setMapLoader((key) => {
    if (pending.has(key)) return;
    pending.add(key);
    fetch('/map/' + mapVersion + '/' + key)
      .then(async (response) => {
        if (!response.ok) throw new Error('Map request failed');
        storeChunk(key, response.status === 204 ? emptyChunk : await response.json());
        pending.delete(key);
      })
      .catch(() => setTimeout(() => pending.delete(key), 2000));
  });
}
