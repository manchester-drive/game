import { expect, test, onTestFinished } from 'bun:test';
import type { Credentials, World } from '../public/game-types';
import { createGameServer } from '../server';

test('two clients share the same authoritative cars and controls belong to their driver', async () => {
  const server = createGameServer({ hostname: '127.0.0.1', port: 0 });
  const abort = new AbortController();
  onTestFinished(async () => {
    abort.abort();
    await server.stop();
  });
  const post = (path: string, payload: unknown) =>
    fetch(new URL(path, server.url), { method: 'POST', body: JSON.stringify(payload) });
  const [a, b] = await Promise.all(
    ['Ada', 'Mo'].map(async (name) => {
      const response = await post('/join', { name });
      expect(response.status).toBe(201);
      return (await response.json()) as Credentials;
    }),
  );
  const streams = await Promise.all(
    [1, 2].map(async () => {
      const res = await fetch(new URL('/events', server.url), { signal: abort.signal });
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      return async () => {
        while (!buffer.includes('\n\n')) {
          const { value, done } = await reader.read();
          expect(!done).toBeTruthy();
          buffer += value;
        }
        const end = buffer.indexOf('\n\n'),
          frame = buffer.slice(6, end);
        buffer = buffer.slice(end + 2);
        return JSON.parse(frame) as World;
      };
    }),
  );
  const [initial] = await Promise.all(streams.map((read) => read()));
  const driver = (world: World, id: string) => world.players.find((p) => p.id === id)!;
  expect(initial.players.length).toBe(2);
  expect((await post('/input', { token: b.id, seq: 1, keys: 1 })).status).toBe(401);
  await post('/input', { token: a.token, seq: 2, keys: 1 });
  await post('/input', { token: a.token, seq: 1, keys: 0 });
  async function moving(read: () => Promise<World>) {
    for (let i = 0; i < 25; i++) {
      const frame = await read();
      if (driver(frame, a.id).x > driver(initial, a.id).x + 1) return frame;
    }
    throw new Error('The other browser never observed acceleration');
  }
  let [first, second] = await Promise.all(streams.map(moving));
  while (first.time < second.time) first = await streams[0]();
  while (second.time < first.time) second = await streams[1]();
  expect(first).toStrictEqual(second);
  expect(driver(first, b.id).x).toBe(driver(initial, b.id).x);
  expect(!JSON.stringify(first).includes(a.token)).toBeTruthy();
  // A mode change invalidates older driving inputs. Both clients observe the same
  // walker and parked car, and a duplicate exit cannot put the walker back inside.
  expect((await post('/vehicle', { token: b.id, action: 'exit', seq: 1 })).status).toBe(401);
  expect((await post('/vehicle', { token: b.token, action: 'exit', seq: 2 })).status).toBe(200);
  expect((await post('/vehicle', { token: b.token, action: 'exit', seq: 2 })).status).toBe(409);
  await post('/input', { token: b.token, seq: 1, keys: 1 });
  async function parked(read: () => Promise<World>) {
    let frame;
    do {
      frame = await read();
    } while (!driver(frame, b.id).parkedCar);
    return driver(frame, b.id);
  }
  const [walker, seen] = await Promise.all(streams.map(parked));
  expect(walker).toStrictEqual(seen);
  expect(walker.speed).toBe(0);
  expect(walker.parkedCar!.x).toBe(driver(initial, b.id).x);
  expect((await post('/vehicle', { token: b.token, action: 'enter', seq: 3 })).status).toBe(200);
  await post('/leave', { token: a.token });
  let frame;
  do {
    frame = await streams[1]();
  } while (frame.players.some((p) => p.id === a.id));
  expect(frame.players.map((p) => p.id)).toStrictEqual([b.id]);
});

test('the Bun server serves the browser bundle and validates game commands', async () => {
  const server = createGameServer({ hostname: '127.0.0.1', port: 0 });
  onTestFinished(() => server.stop());
  const page = await fetch(server.url);
  expect(page.status).toBe(200);
  const html = await page.text();
  const script = html.match(/<script\b[^>]*\bsrc="([^"]+)"/)?.[1];
  expect(script).toBeDefined();
  const bundle = await fetch(new URL(script!, server.url));
  expect(bundle.status).toBe(200);
  expect(bundle.headers.get('Content-Type')).toMatch(/javascript/);

  const join = new URL('/join', server.url);
  for (const [body, status] of [
    ['{', 400],
    ['null', 400],
    ['x'.repeat(2049), 413],
  ] as const) {
    const response = await fetch(join, { method: 'POST', body });
    expect(response.status).toBe(status);
  }
  const foreign = await fetch(join, {
    method: 'POST',
    headers: { Origin: 'https://example.org' },
    body: '{}',
  });
  expect(foreign.status).toBe(403);
  const joined = await fetch(join, { method: 'POST', body: '{"name":"Ada"}' });
  const { token } = (await joined.json()) as Credentials;
  const invalidDoor = await fetch(new URL('/vehicle', server.url), {
    method: 'POST',
    body: JSON.stringify({ token, seq: 1, action: 'unknown' }),
  });
  expect(invalidDoor.status).toBe(409);
  const leave = await fetch(new URL('/leave', server.url), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ token }),
  });
  expect(leave.status).toBe(200);
});
