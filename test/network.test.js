import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createGameServer } from '../server.js';

test('two clients share the same authoritative cars and controls belong to their driver', async (t) => {
  const server = createGameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  const post = (path, payload) =>
    fetch(url + path, { method: 'POST', body: JSON.stringify(payload) });
  const [a, b] = await Promise.all(
    ['Ada', 'Mo'].map(async (name) => {
      const response = await post('/join', { name });
      assert.equal(response.status, 201);
      return response.json();
    }),
  );
  const streams = await Promise.all(
    [1, 2].map(async () => {
      const abort = new AbortController();
      const res = await fetch(url + '/events', { signal: abort.signal });
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      t.after(() => abort.abort());
      let buffer = '';
      return async () => {
        while (!buffer.includes('\n\n')) {
          const { value, done } = await reader.read();
          assert.ok(!done);
          buffer += value;
        }
        const end = buffer.indexOf('\n\n'),
          frame = buffer.slice(6, end);
        buffer = buffer.slice(end + 2);
        return JSON.parse(frame);
      };
    }),
  );
  const [initial] = await Promise.all(streams.map((read) => read()));
  const driver = (world, id) => world.players.find((p) => p.id === id);
  assert.equal(initial.players.length, 2);
  assert.equal((await post('/input', { token: b.id, seq: 1, keys: 1 })).status, 401);
  await post('/input', { token: a.token, seq: 2, keys: 1 });
  await post('/input', { token: a.token, seq: 1, keys: 0 });
  async function moving(read) {
    for (let i = 0; i < 25; i++) {
      const frame = await read();
      if (driver(frame, a.id).x > driver(initial, a.id).x + 1) return frame;
    }
    assert.fail('The other browser never observed acceleration');
  }
  let [first, second] = await Promise.all(streams.map(moving));
  while (first.time < second.time) first = await streams[0]();
  while (second.time < first.time) second = await streams[1]();
  assert.deepEqual(first, second);
  assert.equal(driver(first, b.id).x, driver(initial, b.id).x);
  assert.ok(!JSON.stringify(first).includes(a.token));
  // A mode change invalidates older driving inputs. Both clients observe the same
  // walker and parked car, and a duplicate exit cannot put the walker back inside.
  assert.equal((await post('/vehicle', { token: b.id, action: 'exit', seq: 1 })).status, 401);
  assert.equal((await post('/vehicle', { token: b.token, action: 'exit', seq: 2 })).status, 200);
  assert.equal((await post('/vehicle', { token: b.token, action: 'exit', seq: 2 })).status, 409);
  await post('/input', { token: b.token, seq: 1, keys: 1 });
  async function parked(read) {
    let frame;
    do {
      frame = await read();
    } while (!driver(frame, b.id).parkedCar);
    return driver(frame, b.id);
  }
  const [walker, seen] = await Promise.all(streams.map(parked));
  assert.deepEqual(walker, seen);
  assert.equal(walker.speed, 0);
  assert.equal(walker.parkedCar.x, driver(initial, b.id).x);
  assert.equal((await post('/vehicle', { token: b.token, action: 'enter', seq: 3 })).status, 200);
  await post('/leave', { token: a.token });
  let frame;
  do {
    frame = await streams[1]();
  } while (driver(frame, a.id));
  assert.deepEqual(
    frame.players.map((p) => p.id),
    [b.id],
  );
});
