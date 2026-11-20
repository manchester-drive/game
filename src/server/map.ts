import archive from '../game/map/region.pack' with { type: 'file' };
import offsets from '../game/map/index.json';
import { gunzipSync } from 'node:zlib';
import { emptyChunk, setMapLoader, storeChunk } from '../game/region';

// Bun embeds the compressed archive in the standalone executable. Physics and HTTP
// share its bytes, and only the chunks needed for simulation are decoded here.
const pack = await Bun.file(archive).bytes();
const index = new Map(Object.entries(offsets));

function packedChunk(key: string) {
  const entry = index.get(key);
  if (!entry) return;
  const [start, size] = entry;
  return pack.subarray(start, start + size);
}

export function serveMapChunk(key: string) {
  const bytes = packedChunk(key);
  const headers = { 'Cache-Control': 'public, max-age=31536000, immutable' };
  if (!bytes) return new Response(null, { status: 204, headers });
  return new Response(bytes, {
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
    },
  });
}

export function useServerMap() {
  setMapLoader((key) => {
    const bytes = packedChunk(key);
    if (!bytes) return emptyChunk;
    return storeChunk(key, JSON.parse(gunzipSync(bytes).toString()));
  });
}
