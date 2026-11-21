import type { Position, Player, Vehicle, TrafficCar } from '../src/game/game-types';
import { appearance } from '../src/game/garage';
import { expect, test } from 'bun:test';
import { createWorld, drive, placePlayer, signals, step } from '../src/game/world';
import { circuit, circuits, crosswalks, gates, streetAt } from '../src/game/streets';
import { findRaceGrid } from '../src/game/world';
import { raceCommand } from '../src/game/race';

const car = (x: number, y: number, angle = 0): Player => ({
  id: 'me',
  name: 'Driver',
  color: 'red',
  ...appearance(),
  parkedCar: null,
  x,
  y,
  angle,
  speed: 0,
});
// Open ground in Piccadilly Gardens for straight-line driving checks.
const straight = { x: 2506, y: 2468 };
const dt = 1 / 60;
function hold(
  player: Vehicle,
  keys: number,
  ticks: number,
  others: Vehicle[] = [],
  people: Position[] = [],
) {
  for (let i = 0; i < ticks; i++) drive(player, keys, dt, others, people);
}

test('braking reaches a standstill before reverse and steering changes direction in reverse', () => {
  const player = car(straight.x, straight.y);
  hold(player, 1, 45);
  expect(player.speed > 0).toBeTruthy();
  while (player.speed > 0) drive(player, 2, dt, [], []);
  expect(player.speed).toBe(0);
  const stoppedAt = player.x;
  hold(player, 2 | 8, 20);
  expect(player.speed < 0 && player.x < stoppedAt && player.angle < 0).toBeTruthy();
  const parked = car(straight.x - 20, straight.y);
  hold(parked, 4, 20);
  expect(parked.angle).toBe(0);
});

test('rear lights distinguish coasting, braking and reversing with the same pedal', () => {
  const player = car(straight.x, straight.y);
  hold(player, 1, 30);
  hold(player, 0, 5);
  expect(player.rearLights).toBe('tail');
  do {
    drive(player, 2, dt, [], []);
    expect(player.rearLights).toBe('brake');
  } while (player.speed > 0);
  hold(player, 2, 15);
  expect(player.rearLights).toBe('reverse');
  hold(player, 0, 1);
  expect(player.rearLights).toBe('reverse');
  hold(player, 1, 1);
  expect(player.rearLights).toBe('brake');
  hold(player, 1, 20);
  expect(player.rearLights).toBe('tail');
});

// Midpoint and outside normal of the long southeast facade of Afflecks.
const wall = { x: 2983, y: 1702.5, angle: Math.atan2(62, 75) };
function byWall(distance: number, angle: number) {
  return car(
    wall.x + distance * Math.cos(wall.angle),
    wall.y + distance * Math.sin(wall.angle),
    angle,
  );
}
function wallDistance(p: Position) {
  return (p.x - wall.x) * Math.cos(wall.angle) + (p.y - wall.y) * Math.sin(wall.angle);
}
test('the mapped Afflecks facade stops a car and permits reversing away', () => {
  const p = byWall(28, wall.angle + Math.PI);
  hold(p, 1, 120);
  expect(wallDistance(p) >= 9.5 && wallDistance(p) < 10).toBeTruthy();
  hold(p, 2, 45);
  expect(wallDistance(p) > 15).toBeTruthy();
});
test('a glancing impact slides along the diagonal facade and rebounds', () => {
  const p = byWall(10.7, wall.angle - Math.PI * 0.75);
  const start = { ...p };
  p.speed = 105;
  hold(p, 0, 10);
  expect(wallDistance(p) > wallDistance(start)).toBeTruthy();
  expect(Math.hypot(p.x - start.x, p.y - start.y) > 6 && p.speed < 105).toBeTruthy();
});
test('a pedestrian stops sustained acceleration and allows reversal', () => {
  const p = car(straight.x, straight.y),
    people = [{ x: straight.x + 40, y: straight.y }];
  hold(p, 1, 120, [], people);
  expect(p.x > people[0].x - 14 && p.x <= people[0].x - 11.7).toBeTruthy();
  const x = p.x;
  hold(p, 2, 45, [], people);
  expect(p.x < x - 5).toBeTruthy();
});
test('rear-end impacts transfer momentum between drivers and stronger impacts push farther', () => {
  function bump(speed: number) {
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
      expect(b.x - a.x >= 19 - 1e-6).toBeTruthy();
    }
    expect(a.speed < speed && b.x > parkedX).toBeTruthy();
    return b.x - parkedX;
  }
  expect(bump(100) > bump(25) * 3).toBeTruthy();
});

function onRoute(vehicle: TrafficCar, d: number, speed = 0) {
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
    expect(Math.hypot(npc.x - previous.x, npc.y - previous.y) < 2).toBeTruthy();
    maxDisplacement = Math.max(maxDisplacement, Math.hypot(npc.x - start.x, npc.y - start.y));
  }
  expect(maxDisplacement > 6 && Math.hypot(npc.x - start.x, npc.y - start.y) < 1).toBeTruthy();
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
    expect(lead.d - follower.d >= 30.99).toBeTruthy();
    if (follower.speed < speed - 0.001) {
      braked = true;
      expect(follower.rearLights).toBe('brake');
    }
  }
  expect(braked && follower.speed < 0.01 && lead.speed === 0).toBeTruthy();
  for (let i = 0; i < 4 * 60; i++) step(world, inputs, dt);
  expect(follower.d > d && follower.speed > 0).toBeTruthy();
});

test('eight drivers can join on mapped streets without sharing bays', () => {
  const w = createWorld();
  for (let i = 0; i < 8; i++) {
    const p = placePlayer(String(i), 'Driver', 'red', w);
    if (!p) throw new Error('No free bay for driver ' + i);
    expect(w.players.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 20)).toBeTruthy();
    expect(streetAt(p.x, p.y)).toMatch(/Piccadilly|Street/);
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
  expect(Math.abs(v.d - cross.stop) < 0.01).toBeTruthy();
  expect(walker.next).toBe(1);
  expect(walker.crossing).toBe(false);
  let crossed = false;
  for (let i = 0; i < 18 * 60; i++) {
    step(w, inputs, dt);
    if (walker.crossing) {
      expect(signals(w.time).vertical).toBe('red');
      expect(signals(w.time).horizontal).toBe('red');
      crossed = true;
    }
  }
  expect(crossed && v.d > cross.stop + 45).toBeTruthy();
  expect(walker.next, 'the walker cleared the signal post and returned to the kerb').toBe(4);
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
  expect(Math.abs(v.d - cross.stop) < 0.01).toBeTruthy();
  expect(v.rearLights).toBe('brake');
  for (let i = 0; i < 150; i++) step(w, inputs, dt);
  expect(v.d > cross.stop + 15 && v.rearLights === 'tail').toBeTruthy();
});

test('cars and pedestrians complete repeated circuits in Piccadilly and the Northern Quarter', () => {
  const w = createWorld(),
    inputs = new Map(),
    laps = w.traffic.map(() => 0),
    walks = w.people.map(() => 0),
    indicated = new Set();
  for (let i = 0; i < 60 * 360; i++) {
    const previous = w.traffic.map((v) => ({ ...v }));
    const waypoints = w.people.map((p) => p.next);
    step(w, inputs, dt);
    for (const [j, v] of w.traffic.entries()) {
      const p = previous[j];
      expect(Math.hypot(p.x - v.x, p.y - v.y) < 1.5).toBeTruthy();
      if (v.d < p.d - 100) laps[j]++;
      if (v.indicating) indicated.add(j);
    }
    for (const [j, p] of w.people.entries()) {
      if (waypoints[j] !== 0 && p.next === 0) walks[j]++;
    }
  }
  expect(laps.every((n) => n >= 2)).toBeTruthy();
  expect(indicated.size).toBe(w.traffic.length);
  expect(walks.every((n) => n >= 2)).toBe(true);
});

test('two drivers can steer a full lap from the grid through the mapped gates', () => {
  const w = createWorld(),
    inputs = new Map();
  w.traffic = [];
  w.people = [];
  for (const id of ['a', 'b']) w.players.push(placePlayer(id, id, 'red', w)!);
  raceCommand(w, w.players[0], 'open', null, findRaceGrid);
  raceCommand(w, w.players[1], 'join', w.race!.id, findRaceGrid);
  for (const g of gates) expect(streetAt(g.x, g.y)).toBe(g.street);
  for (let i = 0; i < 60 * 125 && w.race!.phase !== 'results'; i++) {
    for (const [j, p] of w.players.entries()) {
      const target = circuit.pose(circuit.nearest(p.x, p.y) + 20);
      const turn = Math.atan2(target.y - p.y, target.x - p.x) - p.angle;
      const error = Math.atan2(Math.sin(turn), Math.cos(turn));
      const steer = Math.abs(error) < 0.018 ? 0 : error > 0 ? 8 : 4;
      inputs.set(p.id, steer | (p.speed < (j === 0 ? 46 : 38) ? 1 : 0));
    }
    step(w, inputs, dt);
  }
  expect(w.race!.phase).toBe('results');
  expect(
    w.race!.racers.every((r) => r.next === gates.length && r.elapsed !== null && r.elapsed > 0),
  ).toBeTruthy();
  expect(w.race!.racers[0].elapsed! < w.race!.racers[1].elapsed!).toBeTruthy();
});
