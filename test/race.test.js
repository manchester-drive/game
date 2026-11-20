import assert from 'node:assert/strict';
import test from 'node:test';
import { gates, checkGate, raceCommand, withdraw } from '../public/race.js';
import { createWorld, findRaceGrid, placePlayer, step } from '../public/world.js';

function room() {
  const world = createWorld();
  for (const id of ['Ada', 'Mo', 'Lee']) world.players.push(placePlayer(id, id, 'red', world));
  return world;
}
function command(world, who, action) {
  return raceCommand(world, world.players[who], action, world.race?.id ?? null, findRaceGrid);
}
function cross(race, car, index, tick, { backward = false, offset = 0, fraction = 0.5 } = {}) {
  const g = gates[index],
    sign = backward ? -1 : 1;
  const x = g.x + offset * g.dy,
    y = g.y - offset * g.dx;
  checkGate(
    race,
    { ...car, x: x + sign * (1 - fraction) * g.dx, y: y + sign * (1 - fraction) * g.dy },
    x - sign * fraction * g.dx,
    y - sign * fraction * g.dy,
    tick,
    1 / 60,
  );
}

test('joining stages two cars safely and holds only those drivers until the shared start', () => {
  const w = room(),
    [a, b, free] = w.players;
  assert.equal(command(w, 0, 'open'), undefined);
  assert.ok(command(w, 0, 'join'));
  assert.ok(raceCommand(w, b, 'join', 'old-race', findRaceGrid));
  const before = w.players.map((p) => [p.x, p.y]);
  assert.ok(raceCommand(w, b, 'join', w.race.id, () => null));
  assert.deepEqual(
    w.players.map((p) => [p.x, p.y]),
    before,
  );
  assert.equal(command(w, 1, 'join'), undefined);
  assert.equal(w.race.phase, 'countdown');
  assert.ok(command(w, 2, 'join'));
  const grid = [a, b].map((p) => [p.x, p.y]),
    initialY = free.y;
  const inputs = new Map(w.players.map((p) => [p.id, 1]));
  for (let i = 0; i < 180; i++) step(w, inputs, 1 / 60);
  assert.deepEqual(
    [a, b].map((p) => [p.x, p.y]),
    grid,
  );
  assert.notEqual(free.y, initialY);
  for (let i = 0; i < 12; i++) step(w, inputs, 1 / 60);
  assert.equal(w.race.phase, 'racing');
  assert.ok(a.x > grid[0][0] && b.x > grid[1][0]);
});

test('skipped, wrong-way and off-road crossings can be recovered; finish order uses sub-tick times', () => {
  const w = room(),
    [a, b, c] = w.players;
  command(w, 0, 'open');
  command(w, 1, 'join');
  const race = w.race;
  cross(race, a, 0, 1);
  race.phase = 'racing';
  cross(race, a, 4, 4);
  cross(race, a, 0, 5, { backward: true });
  cross(race, a, 0, 6, { offset: 35 });
  cross(race, c, 0, 7);
  assert.equal(race.racers[0].next, 0);
  for (const player of [a, b]) {
    cross(race, player, 0, 8);
    cross(race, player, 2, 9);
    cross(race, player, 4, 10);
    assert.equal(race.racers.find((r) => r.id === player.id).next, 1);
    for (let gate = 1; gate <= 3; gate++) cross(race, player, gate, 11 + gate);
  }
  cross(race, a, 4, 20, { fraction: 0.8 });
  cross(race, b, 4, 20, { fraction: 0.2 });
  assert.equal(race.phase, 'results');
  assert.deepEqual(
    race.racers.map((r) => r.id),
    [b.id, a.id],
  );
  assert.ok(Math.abs(race.racers[0].elapsed - (17 + 0.2 / 60)) < 1e-9);
  assert.ok(race.racers[1].elapsed > race.racers[0].elapsed);
  const previous = race.id;
  assert.equal(command(w, 1, 'open'), undefined);
  assert.notEqual(w.race.id, previous);
  assert.ok(raceCommand(w, b, 'withdraw', previous, findRaceGrid));
});

test('withdrawal releases a grid; departing during the race preserves the other finish', () => {
  const w = room(),
    [a, b] = w.players;
  command(w, 0, 'open');
  command(w, 1, 'join');
  withdraw(w, a.id);
  assert.equal(w.race.phase, 'open');
  assert.deepEqual(
    w.race.racers.map((r) => r.id),
    [b.id],
  );
  command(w, 0, 'join');
  w.race.phase = 'racing';
  withdraw(w, b.id);
  assert.equal(w.race.phase, 'racing');
  for (let i = 0; i < gates.length; i++) cross(w.race, a, i, 20 + i);
  assert.equal(w.race.phase, 'results');
  assert.equal(w.race.racers[1].withdrawn, true);
  assert.equal(w.race.racers[1].elapsed, null);
  assert.ok(w.race.racers[0].elapsed > 0);
});
