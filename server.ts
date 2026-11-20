import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { inputCommand, doorCommand, raceCommandBody } from './public/protocol';
import page from './public/index.html';
import { raceCommand, withdraw } from './public/race';
import { COLORS, createWorld, findRaceGrid, placePlayer, step, useCar } from './public/world';
import type { Player } from './public/game-types';

interface Session {
  token: string;
  player: Player;
  last: number;
  seq: number;
}
type Variables = { body: Record<string, unknown>; session: Session };

const commandBody = z.record(z.string(), z.unknown());
export function createGameServer({
  hostname = Bun.env.HOST || '127.0.0.1',
  port = Number(Bun.env.PORT || 4173),
  development = false,
} = {}) {
  const world = createWorld();
  const sessions = new Map<string, Session>();
  const inputs = new Map<string, number>();
  const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  const snapshot = () => encoder.encode('data: ' + JSON.stringify(world) + '\n\n');

  function leave(session: Session) {
    withdraw(world, session.player.id);
    world.players = world.players.filter((p) => p.id !== session.player.id);
    inputs.delete(session.player.id);
    sessions.delete(session.token);
  }

  const api = new Hono<{ Variables: Variables }>();
  api.use(async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  const authenticatedCommands = ['/input', '/leave', '/race', '/vehicle'];
  api.on(
    'POST',
    ['/join', ...authenticatedCommands],
    bodyLimit({ maxSize: 2048, onError: (c) => c.json({ error: 'Request too large.' }, 413) }),
    async (c, next) => {
      const origin = c.req.header('Origin');
      if (origin && URL.parse(origin)?.host !== c.req.header('Host'))
        return c.json({ error: 'Open the game on this host.' }, 403);
      // pagehide sends /leave as a text/plain beacon containing JSON.
      const body = commandBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ error: 'Invalid request.' }, 400);
      c.set('body', body.data);
      await next();
    },
  );

  api.post('/join', (c) => {
    if (sessions.size >= 8)
      return c.json({ error: 'The junction is full. Try again when a driver leaves.' }, 409);
    const data = c.var.body;
    const name = typeof data.name === 'string' ? data.name.trim().slice(0, 16) : '';
    const id = crypto.randomUUID(),
      token = crypto.randomUUID();
    const color = COLORS.find((c) => !world.players.some((p) => p.color === c))!;
    const player = placePlayer(id, name || 'Driver', color, world, data);
    if (!player)
      return c.json({ error: 'Traffic is blocking the starting bays. Try again shortly.' }, 409);
    sessions.set(token, { player, token, last: Date.now(), seq: -1 });
    world.players.push(player);
    return c.json({ id, token }, 201);
  });
  api.on('POST', authenticatedCommands, async (c, next) => {
    const { token } = c.var.body;
    const session = typeof token === 'string' && sessions.get(token);
    if (!session) return c.json({ error: 'Your car left the junction. Join again.' }, 401);
    c.set('session', session);
    await next();
  });
  api.post('/input', (c) => {
    const { session, body } = c.var;
    const { player } = session;
    const result = inputCommand.safeParse(body);
    if (result.success && result.data.seq > session.seq) {
      session.last = Date.now();
      session.seq = result.data.seq;
      if (result.data.onFoot === !!player.parkedCar) inputs.set(player.id, result.data.keys);
    }
    return c.json({});
  });
  api.post('/vehicle', (c) => {
    const { session, body } = c.var;
    const { player } = session;
    const result = doorCommand.safeParse(body);
    if (!result.success || result.data.seq <= session.seq)
      return c.json({ error: 'Please try the door again.' }, 409);
    session.seq = result.data.seq;
    session.last = Date.now();
    inputs.set(player.id, 0);
    const error = useCar(world, player, result.data.action);
    return error ? c.json({ error }, 409) : c.json({});
  });
  api.post('/race', (c) => {
    const result = raceCommandBody.safeParse(c.var.body);
    if (!result.success) return c.json({ error: 'Invalid race command.' }, 409);
    const error = raceCommand(
      world,
      c.var.session.player,
      result.data.action,
      result.data.raceId,
      findRaceGrid,
    );
    return error ? c.json({ error }, 409) : c.json({});
  });
  api.post('/leave', (c) => {
    leave(c.var.session);
    return c.json({});
  });
  api.notFound((c) => c.json({ error: 'Unknown route.' }, 404));

  const server = Bun.serve({
    hostname,
    port,
    development,
    routes: {
      '/': page,
      '/index.html': page,
      '/events': {
        GET(req, server) {
          server.timeout(req, 0);
          let stream: ReadableStreamDefaultController<Uint8Array>;
          const body = new ReadableStream<Uint8Array>(
            {
              start(controller) {
                stream = controller;
                stream.enqueue(snapshot());
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
    fetch: api.fetch,
  });

  let last = performance.now(),
    tick = 0,
    accumulator = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    accumulator += Math.min((now - last) / 1000, 0.2);
    last = now;
    for (const s of sessions.values()) {
      const idle = Date.now() - s.last;
      if (idle > 15000) leave(s);
      else if (idle > 2500) inputs.set(s.player.id, 0);
    }
    while (accumulator >= 1 / 60) {
      step(world, inputs, 1 / 60);
      accumulator -= 1 / 60;
      if (++tick % 4 !== 0 || !streams.size) continue;
      const frame = snapshot();
      for (const stream of streams) {
        if ((stream.desiredSize ?? 0) < frame.length) {
          streams.delete(stream);
          stream.error(new Error('Client fell behind.'));
        } else stream.enqueue(frame);
      }
    }
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
