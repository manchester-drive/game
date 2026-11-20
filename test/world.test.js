import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorld, drive, placePlayer, signals, step } from '../public/world.js';
import { circuit, circuits, crosswalks, gates, streetAt } from '../public/streets.js';
import { findRaceGrid } from '../public/world.js';
import { raceCommand } from '../public/race.js';

const car = (x, y, angle = 0) => ({ id: 'me', x, y, angle, speed: 0 });
// Open ground in Piccadilly Gardens for straight-line driving checks.
const straight = { x: 2506, y: 2468 };
const dt = 1 / 60;
function hold(player, keys, ticks, others = [], people = []) {
  for (let i = 0; i < ticks; i++) drive(player, keys, dt, others, people);
}

test('braking reaches a standstill before reverse and steering changes direction in reverse', () => {
  const player = car(straight.x, straight.y);
  hold(player, 1, 45);
  assert.ok(player.speed > 0);
  while (player.speed > 0) drive(player, 2, dt, [], []);
  assert.equal(player.speed, 0);
  const stoppedAt = player.x;
  hold(player, 2 | 8, 20);
  assert.ok(player.speed < 0 && player.x < stoppedAt && player.angle < 0);
  const parked = car(straight.x - 20, straight.y);
  hold(parked, 4, 20);
  assert.equal(parked.angle, 0);
});

test('rear lights distinguish coasting, braking and reversing with the same pedal', () => {
  const player = car(straight.x, straight.y);
  hold(player, 1, 30);
  hold(player, 0, 5);
  assert.equal(player.rearLights, 'tail');
  do {
    drive(player, 2, dt, [], []);
    assert.equal(player.rearLights, 'brake');
  } while (player.speed > 0);
  hold(player, 2, 15);
  assert.equal(player.rearLights, 'reverse');
  hold(player, 0, 1);
  assert.equal(player.rearLights, 'reverse');
  hold(player, 1, 1);
  assert.equal(player.rearLights, 'brake');
  hold(player, 1, 20);
  assert.equal(player.rearLights, 'tail');
});

// Midpoint and outside normal of the long southeast facade of Afflecks.
const wall = { x: 2983, y: 1702.5, angle: Math.atan2(62, 75) };
function byWall(distance, angle) {
  return car(
    wall.x + distance * Math.cos(wall.angle),
    wall.y + distance * Math.sin(wall.angle),
    angle,
  );
}
function wallDistance(p) {
  return (p.x - wall.x) * Math.cos(wall.angle) + (p.y - wall.y) * Math.sin(wall.angle);
}
test('the mapped Afflecks facade stops a car and permits reversing away', () => {
  const p = byWall(28, wall.angle + Math.PI);
  hold(p, 1, 120);
  assert.ok(wallDistance(p) >= 9.5 && wallDistance(p) < 10);
  hold(p, 2, 45);
  assert.ok(wallDistance(p) > 15);
});
test('a glancing impact slides along the diagonal facade and rebounds', () => {
  const p = byWall(10.7, wall.angle - Math.PI * 0.75);
  const start = { ...p };
  p.speed = 105;
  hold(p, 0, 10);
  assert.ok(wallDistance(p) > wallDistance(start));
  assert.ok(Math.hypot(p.x - start.x, p.y - start.y) > 6 && p.speed < 105);
});
test('a pedestrian stops sustained acceleration and allows reversal', () => {
  const p = car(straight.x, straight.y),
    people = [{ x: straight.x + 40, y: straight.y }];
  hold(p, 1, 120, [], people);
  assert.ok(p.x > people[0].x - 14 && p.x <= people[0].x - 11.7);
  const x = p.x;
  hold(p, 2, 45, [], people);
  assert.ok(p.x < x - 5);
});
test('rear-end impacts transfer momentum between drivers and stronger impacts push farther', () => {
  function bump(speed) {
    const world = createWorld(),
      inputs = new Map();
    const a = { ...car(straight.x, straight.y), id: 'a', speed },
      b = { ...car(straight.x + 20, straight.y), id: 'b' };
    const parkedX = b.x;
    world.players = [a, b];
    world.traffic = [];
    world.people = [];
    for (let i = 0; i < 15; i++) {
      step(world, inputs, dt);
      assert.ok(b.x - a.x >= 19 - 1e-6);
    }
    assert.ok(a.speed < speed && b.x > parkedX);
    return b.x - parkedX;
  }
  assert.ok(bump(100) > bump(25) * 3);
});

function onRoute(vehicle, d, speed = 0) {
  Object.assign(vehicle, circuits[vehicle.lane].pose(d), { d, speed });
}
test('a side impact displaces a waiting traffic car and it recovers its lane', () => {
  const world = createWorld(),
    npc = world.traffic[0],
    inputs = new Map();
  world.traffic = [npc];
  world.people = [];
  onRoute(npc, crosswalks[0].stop);
  const start = { ...npc },
    nx = -Math.sin(npc.angle),
    ny = Math.cos(npc.angle);
  const player = car(npc.x + nx * 15, npc.y + ny * 15, npc.angle - Math.PI / 2);
  player.speed = 105;
  world.players = [player];
  step(world, inputs, dt);
  world.players = [];
  let maxDisplacement = 0;
  for (let i = 0; i < 240; i++) {
    const previous = { ...npc };
    step(world, inputs, dt);
    assert.ok(Math.hypot(npc.x - previous.x, npc.y - previous.y) < 2);
    maxDisplacement = Math.max(maxDisplacement, Math.hypot(npc.x - start.x, npc.y - start.y));
  }
  assert.ok(maxDisplacement > 6 && Math.hypot(npc.x - start.x, npc.y - start.y) < 1);
});

test('followers brake before a queue, leave a bumper gap and pull away on green', () => {
  const world = createWorld(),
    inputs = new Map(),
    [lead, follower] = world.traffic;
  world.traffic = [lead, follower];
  world.people = [];
  const d = crosswalks[0].stop;
  onRoute(lead, d);
  onRoute(follower, d - 85, 40);
  let braked = false;
  for (let i = 0; i < 8 * 60; i++) {
    const speed = follower.speed;
    step(world, inputs, dt);
    assert.ok(lead.d - follower.d >= 30.99);
    if (follower.speed < speed - 0.001) {
      braked = true;
      assert.equal(follower.rearLights, 'brake');
    }
  }
  assert.ok(braked && follower.speed < 0.01 && lead.speed === 0);
  for (let i = 0; i < 4 * 60; i++) step(world, inputs, dt);
  assert.ok(follower.d > d && follower.speed > 0);
});

test('eight drivers can join on mapped streets without sharing bays', () => {
  const w = createWorld();
  for (let i = 0; i < 8; i++) {
    const p = placePlayer(String(i), 'Driver', 'red', w);
    assert.ok(p && w.players.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 20));
    assert.match(streetAt(p.x, p.y), /Piccadilly|Street/);
    w.players.push(p);
  }
});

test('at a signalised crossing traffic waits on red and the walker crosses on all red', () => {
  const w = createWorld(),
    v = w.traffic[0],
    walker = w.people[0],
    cross = crosswalks[0],
    inputs = new Map();
  w.traffic = [v];
  w.people = [walker];
  w.time = 17.1;
  onRoute(v, cross.stop - 5, 30);
  for (let i = 0; i < 120; i++) step(w, inputs, dt);
  assert.ok(Math.abs(v.d - cross.stop) < 0.01);
  assert.equal(walker.next, 1);
  assert.equal(walker.crossing, false);
  let crossed = false;
  for (let i = 0; i < 18 * 60; i++) {
    step(w, inputs, dt);
    if (walker.crossing) {
      assert.equal(signals(w.time).vertical, 'red');
      assert.equal(signals(w.time).horizontal, 'red');
      crossed = true;
    }
  }
  assert.ok(crossed && v.d > cross.stop + 45);
});

test('traffic yields at the unmarked Faraday Street crossing and resumes', () => {
  const w = createWorld(),
    v = w.traffic[0],
    cross = crosswalks[2],
    inputs = new Map();
  w.traffic = [v];
  w.people = [w.people[2]];
  onRoute(v, cross.stop - 1, 30);
  for (let i = 0; i < 15; i++) step(w, inputs, dt);
  assert.ok(Math.abs(v.d - cross.stop) < 0.01);
  assert.equal(v.rearLights, 'brake');
  for (let i = 0; i < 150; i++) step(w, inputs, dt);
  assert.ok(v.d > cross.stop + 15 && v.rearLights === 'tail');
});

test('all traffic completes repeated laps through turns, signals and the Faraday merge', () => {
  const w = createWorld(),
    inputs = new Map(),
    laps = w.traffic.map(() => 0),
    indicated = new Set();
  for (let i = 0; i < 60 * 360; i++) {
    const previous = w.traffic.map((v) => ({ ...v }));
    step(w, inputs, dt);
    for (const [j, v] of w.traffic.entries()) {
      const p = previous[j];
      assert.ok(Math.hypot(p.x - v.x, p.y - v.y) < 1.5);
      if (v.d < p.d - 100) laps[j]++;
      if (v.indicating) indicated.add(j);
    }
  }
  assert.ok(laps.every((n) => n >= 2));
  assert.equal(indicated.size, w.traffic.length);
});

test('two drivers can steer a full lap from the grid through the mapped gates', () => {
  const w = createWorld(),
    inputs = new Map();
  w.traffic = [];
  w.people = [];
  for (const id of ['a', 'b']) w.players.push(placePlayer(id, id, 'red', w));
  raceCommand(w, w.players[0], 'open', null, findRaceGrid);
  raceCommand(w, w.players[1], 'join', w.race.id, findRaceGrid);
  for (const g of gates) assert.equal(streetAt(g.x, g.y), g.street);
  for (let i = 0; i < 60 * 125 && w.race.phase !== 'results'; i++) {
    for (const [j, p] of w.players.entries()) {
      const target = circuit.pose(circuit.nearest(p.x, p.y) + 20);
      const turn = Math.atan2(target.y - p.y, target.x - p.x) - p.angle;
      const error = Math.atan2(Math.sin(turn), Math.cos(turn));
      const steer = Math.abs(error) < 0.018 ? 0 : error > 0 ? 8 : 4;
      inputs.set(p.id, steer | (p.speed < (j === 0 ? 46 : 38) ? 1 : 0));
    }
    step(w, inputs, dt);
  }
  assert.equal(w.race.phase, 'results');
  assert.ok(w.race.racers.every((r) => r.next === gates.length && r.elapsed > 0));
  assert.ok(w.race.racers[0].elapsed < w.race.racers[1].elapsed);
});
