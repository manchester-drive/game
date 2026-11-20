import { serveMapChunk, useServerMap } from './map';
import { mapVersion } from '../game/region';
import page from '../client/index.html';
import type { World } from '../game/game-types';
import { encodeSnapshot, snapshotPath } from '../protocol/snapshots';
import { GameRoom } from './room';
import { createRoutes } from './routes';

export function createGameServer({
  hostname = Bun.env.HOST || '127.0.0.1',
  port = Number(Bun.env.PORT || 4173),
  development = false,
} = {}) {
  useServerMap();
  const room = new GameRoom();
  const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  function broadcast(world: World) {
    if (!streams.size) return;
    const frame = encodeSnapshot(world);
    for (const stream of streams) {
      if ((stream.desiredSize ?? 0) < frame.length) {
        streams.delete(stream);
        stream.error(new Error('Client fell behind.'));
      } else stream.enqueue(frame);
    }
  }

  const server = Bun.serve({
    hostname,
    port,
    development,
    routes: {
      '/map/:version/:key': {
        GET(req) {
          return req.params.version === mapVersion
            ? serveMapChunk(req.params.key)
            : new Response(null, { status: 404 });
        },
      },
      '/': page,
      '/index.html': page,
      [snapshotPath]: {
        GET(req, server) {
          server.timeout(req, 0);
          let stream: ReadableStreamDefaultController<Uint8Array>;
          const body = new ReadableStream<Uint8Array>(
            {
              start(controller) {
                stream = controller;
                stream.enqueue(encodeSnapshot(room.world));
                streams.add(stream);
              },
              cancel() {
                streams.delete(stream);
              },
            },
            new ByteLengthQueuingStrategy({ highWaterMark: 128 * 1024 }),
          );
          return new Response(body, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache, no-transform',
              'X-Accel-Buffering': 'no',
            },
          });
        },
      },
    },
    fetch: createRoutes(room).fetch,
  });

  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    room.advance((now - last) / 1000, broadcast);
    last = now;
  }, 1000 / 60);

  return {
    url: server.url,
    stop() {
      clearInterval(timer);
      for (const stream of streams) stream.close();
      streams.clear();
      return server.stop(true);
    },
  };
}

if (import.meta.main) {
  const server = createGameServer({ development: Bun.env.NODE_ENV === 'development' });
  console.log('Manchester Drive listening on ' + server.url);
}
