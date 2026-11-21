import { serveMapChunk, useServerMap } from './map';
import { mapVersion } from '../game/region';
import page from '../client/index.html';
import type { World } from '../game/game-types';
import { encodeChat, encodeSnapshot, snapshotPath } from '../protocol/snapshots';
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
  function broadcast(frame: Uint8Array) {
    for (const stream of streams) {
      // A single large snapshot can exceed the queue budget even for a caught-up client.
      if ((stream.desiredSize ?? 0) <= 0) {
        streams.delete(stream);
        stream.error(new Error('Client fell behind.'));
      } else stream.enqueue(frame);
    }
  }

  function publishWorld(world: World) {
    if (streams.size) broadcast(encodeSnapshot(world));
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
                stream.enqueue(encodeChat({ type: 'history', messages: room.chatHistory }));
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
    fetch: createRoutes(room, (message) => broadcast(encodeChat({ type: 'message', message })))
      .fetch,
  });

  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    room.advance((now - last) / 1000, publishWorld);
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
