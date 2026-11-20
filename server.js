import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { raceCommand, withdraw } from './public/race.js';
import { COLORS, createWorld, findRaceGrid, placePlayer, step, useCar } from './public/world.js';

const media = { html: 'text/html', js: 'text/javascript', css: 'text/css' };
const files = new Set([
  'index.html',
  'style.css',
  'client.js',
  'art.js',
  'world.js',
  'streets.js',
  'manchester-map.js',
  'race.js',
  'garage.js',
]);
export function createGameServer() {
  const world = createWorld(),
    sessions = new Map(),
    inputs = new Map(),
    streams = new Set();
  let timer,
    tick = 0,
    last = performance.now(),
    accumulator = 0;
  function leave(token) {
    const session = sessions.get(token);
    if (!session) return;
    withdraw(world, session.id);
    world.players = world.players.filter((p) => p.id !== session.id);
    inputs.delete(session.id);
    sessions.delete(token);
  }
  function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        });
        res.write('data: ' + JSON.stringify(world) + '\n\n');
        streams.add(res);
        res.on('close', () => streams.delete(res));
        return;
      }
      if (
        req.method === 'POST' &&
        ['/join', '/input', '/leave', '/race', '/vehicle'].includes(path)
      ) {
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
          return json(res, 403, { error: 'Open the game on this host.' });
        let body = '';
        for await (const chunk of req) {
          if (body.length + chunk.length > 2048)
            return json(res, 413, { error: 'Request too large.' });
          body += chunk;
        }
        const data = JSON.parse(body);
        if (!data || typeof data !== 'object') return json(res, 400, { error: 'Invalid request.' });
        if (path === '/join') {
          if (sessions.size >= 8)
            return json(res, 409, {
              error: 'The junction is full. Try again when a driver leaves.',
            });
          const id = randomUUID(),
            token = randomUUID();
          const name = typeof data.name === 'string' ? data.name.trim().slice(0, 16) : '';
          const color = COLORS.find((c) => !world.players.some((p) => p.color === c));
          const player = placePlayer(id, name || 'Driver', color, world, data);
          if (!player)
            return json(res, 409, {
              error: 'Traffic is blocking the starting bays. Try again shortly.',
            });
          sessions.set(token, { id, last: Date.now(), seq: -1 });
          world.players.push(player);
          return json(res, 201, { id, token });
        }
        const session = sessions.get(data.token);
        if (!session) return json(res, 401, { error: 'Your car left the junction. Join again.' });
        if (path === '/vehicle') {
          if (!Number.isSafeInteger(data.seq) || data.seq <= session.seq)
            return json(res, 409, { error: 'Please try the door again.' });
          session.seq = data.seq;
          session.last = Date.now();
          inputs.set(session.id, 0);
          const player = world.players.find((p) => p.id === session.id);
          const error = useCar(world, player, data.action);
          return error ? json(res, 409, { error }) : json(res, 200, {});
        }
        if (path === '/race') {
          const player = world.players.find((p) => p.id === session.id);
          const error = raceCommand(world, player, data.action, data.raceId, findRaceGrid);
          return error ? json(res, 409, { error }) : json(res, 200, {});
        }
        if (path === '/leave') leave(data.token);
        else if (
          Number.isSafeInteger(data.seq) &&
          data.seq > session.seq &&
          Number.isInteger(data.keys) &&
          data.keys >= 0 &&
          data.keys < 16
        ) {
          session.last = Date.now();
          session.seq = data.seq;
          const player = world.players.find((p) => p.id === session.id);
          if (!!data.onFoot === !!player.parkedCar) inputs.set(session.id, data.keys);
        }
        return json(res, 200, {});
      }
      const file = path === '/' ? 'index.html' : path.slice(1);
      if (req.method !== 'GET' || !files.has(file))
        return json(res, 404, { error: 'Unknown route.' });
      const contents = await readFile(new URL('./public/' + file, import.meta.url));
      res.writeHead(200, {
        'Content-Type': media[file.split('.').pop()] + '; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(contents);
    } catch (error) {
      json(res, error instanceof SyntaxError ? 400 : 500, {
        error: 'Could not process the request.',
      });
    }
  });
  server.on('listening', () => {
    last = performance.now();
    timer = setInterval(() => {
      const now = performance.now();
      accumulator += Math.min((now - last) / 1000, 0.2);
      last = now;
      for (const [token, s] of sessions) {
        const idle = Date.now() - s.last;
        if (idle > 15000) leave(token);
        else if (idle > 2500) inputs.set(s.id, 0);
      }
      while (accumulator >= 1 / 60) {
        step(world, inputs, 1 / 60);
        accumulator -= 1 / 60;
        tick++;
        if (tick % 4 === 0 && streams.size) {
          const frame = 'data: ' + JSON.stringify(world) + '\n\n';
          for (const res of streams) {
            if (res.writableLength > 128 * 1024) res.destroy();
            else res.write(frame);
          }
        }
      }
    }, 1000 / 60);
  });
  server.on('close', () => clearInterval(timer));
  return server;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.HOST || '127.0.0.1',
    port = Number(process.env.PORT || 4173);
  createGameServer().listen(port, host, () =>
    console.log('Manchester Drive listening on http://' + host + ':' + port),
  );
}
