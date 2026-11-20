import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorld, drive, placePlayer, signals, step } from '../public/world.js';
import { HEIGHT, gardens, streets, streetAt, circuit } from '../public/streets.js';

const car = (x, y, angle = 0) => ({ id: 'me', x, y, angle, speed: 0 });
const dt = 1 / 60;
function hold(player, keys, ticks, others = [], people = []) {
  for (let i = 0; i < ticks; i++) drive(player, keys, dt, others, people);
}

test('braking reaches a standstill before reverse and steering changes direction in reverse', () => {
  const player = car(160, 280);
  hold(player, 1, 45);
  assert.ok(player.speed > 0);
  while (player.speed > 0) drive(player, 2, dt, [], []);
  assert.equal(player.speed, 0);
  const stoppedAt = player.x;
  hold(player, 2 | 8, 20);
  assert.ok(player.speed < 0 && player.x < stoppedAt && player.angle < 0);
  const parked = car(140, 280);
  hold(parked, 4, 20);
  assert.equal(parked.angle, 0);
});

test('rear lights distinguish coasting, braking and reversing with the same pedal', () => {
  const player = car(160, 280);
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

test('solid facades and pedestrians stop sustained acceleration and allow reversal', () => {
  for (const building of [true, false]) {
    const player = building ? car(300, 250, -Math.PI / 2) : car(150, 280);
    const people = building ? [] : [{ x: 190, y: 280 }];
    hold(player, 1, 120, [], people);
    if (building) assert.ok(player.y >= 231 && player.y < 233);
    else assert.ok(player.x > 176 && player.x <= 178.3);
    const { x, y } = player;
    hold(player, 2, 45, [], people);
    assert.ok(building ? player.y > y + 5 : player.x < x - 5);
  }
});

test('a glancing building impact rebounds away while carrying the car along the facade', () => {
  const player = car(280, 232.8, -Math.PI / 4);
  player.speed = 105;
  const x = player.x,
    y = player.y;
  hold(player, 0, 8);
  assert.ok(player.x > x + 5 && player.y > y);
  assert.ok(Math.abs(player.speed) < 105);
});

test('rear-end impacts transfer momentum between drivers and stronger impacts push farther', () => {
  function bump(speed) {
    const world = createWorld(),
      inputs = new Map();
    const a = { ...car(150, 280), id: 'a', speed },
      b = { ...car(170, 280), id: 'b' };
    world.players = [a, b];
    world.traffic = [];
    world.people = [];
    for (let i = 0; i < 15; i++) {
      step(world, inputs, dt);
      assert.ok(b.x - a.x >= 19 - 1e-6);
    }
    assert.ok(a.speed < speed && b.x > 170);
    return b.x - 170;
  }
  assert.ok(bump(100) > bump(25) * 3);
});

test('a side impact displaces a traffic car and it recovers its lane without snapping', () => {
  const world = createWorld(),
    inputs = new Map(),
    npc = world.traffic[0];
  world.time = 10;
  world.traffic = [npc];
  world.people = [];
  Object.assign(npc, { x: 354, d: 354, speed: 0 });
  const player = { ...car(354, 281, -Math.PI / 2), speed: 105 };
  world.players = [player];
  step(world, inputs, dt);
  assert.ok(npc.y < 266);
  world.players = [];
  let maxDisplacement = 0;
  for (let i = 0; i < 240; i++) {
    const y = npc.y;
    step(world, inputs, dt);
    assert.ok(Math.abs(npc.y - y) < 2);
    maxDisplacement = Math.max(maxDisplacement, 266 - npc.y);
  }
  assert.ok(maxDisplacement > 6 && Math.abs(npc.y - 266) < 1);
});

test('followers brake before a queue, leave a bumper gap and pull away with the leader', () => {
  // The circuit and through lane share this stretch of Portland Street.
  const world = createWorld(),
    inputs = new Map();
  const lead = world.traffic.find((v) => v.lane === 2);
  const follower = world.traffic.find((v) => v.lane === 'gardens');
  Object.assign(lead, { y: 322, d: HEIGHT - 322, speed: 0 });
  const d = circuit.lights - 85;
  Object.assign(follower, circuit.pose(d), { d, speed: 40 });
  world.traffic = [follower, lead];
  world.people = [];
  let braked = false;
  for (let i = 0; i < 8 * 60; i++) {
    const speed = follower.speed;
    step(world, inputs, dt);
    const gap = follower.y - lead.y - 19;
    assert.ok(gap >= 11.99);
    if (follower.speed < speed - 0.001 && gap > 13) {
      assert.equal(follower.rearLights, 'brake');
      braked = true;
    }
  }
  assert.ok(braked && follower.speed < 0.01);
  assert.equal(follower.rearLights, 'brake');
  assert.equal(lead.rearLights, 'brake');
  assert.ok(Math.abs(follower.y - lead.y - 19 - 12) < 0.01);
  for (let i = 0; i < 4 * 60; i++) {
    const speed = follower.speed;
    step(world, inputs, dt);
    if (follower.speed > speed + 0.001) assert.equal(follower.rearLights, 'tail');
  }
  assert.ok(follower.y < 330 && follower.speed > 0);
});

test('an occupied starting bay is skipped', () => {
  const world = createWorld();
  const a = placePlayer('a', 'A', 'red', world);
  world.players.push(a);
  const b = placePlayer('b', 'B', 'blue', world);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 20);
});

test('traffic queues on red, clears the junction on green, and a pedestrian crosses during all red', () => {
  const world = createWorld(),
    inputs = new Map();
  world.time = 11;
  const vehicle = world.traffic[0];
  vehicle.d = 345;
  vehicle.x = 345;
  const walker = world.people[0];
  for (let i = 0; i < 180; i++) step(world, inputs, dt);
  assert.equal(vehicle.x, 354);
  assert.equal(walker.x, 359);
  let crossed = false;
  for (let i = 0; i < 13 * 60; i++) {
    step(world, inputs, dt);
    if (walker.x > 373 && walker.x < 427) {
      const light = signals(world.time);
      assert.equal(light.horizontal, 'red');
      assert.equal(light.vertical, 'red');
      crossed = true;
    }
  }
  assert.ok(crossed && walker.x > 430);
  assert.ok(vehicle.x > 430);
});

test('a driver can take four right turns and return to Piccadilly on the road', () => {
  const player = car(300, 266);
  const names = new Set();
  const onRoad = () => {
    const paved = streets.some((s) => {
      const along = s.vertical ? player.y - s.y : player.x - s.x;
      const across = s.vertical ? player.x - s.x : player.y - s.y;
      return along >= -27 && along <= s.length + 27 && Math.abs(across) <= 27;
    });
    assert.ok(paved, 'car left the road at ' + player.x + ', ' + player.y);
    names.add(streetAt(player.x, player.y));
  };
  function travelUntil(reached, steer = 0) {
    for (let tick = 0; tick < 600; tick++) {
      if (reached()) return;
      drive(player, (player.speed < 43 ? 1 : 0) | steer, dt, [], []);
      onRoad();
    }
    assert.fail('did not reach next turn');
  }
  const turnTo = (angle) => travelUntil(() => player.angle >= angle, 8);
  travelUntil(() => player.x >= gardens.east + 14 - 22);
  turnTo(Math.PI / 2);
  travelUntil(() => player.y >= gardens.south + 14 - 22);
  turnTo(Math.PI);
  travelUntil(() => player.x <= gardens.west - 14 + 22);
  turnTo((3 * Math.PI) / 2);
  travelUntil(() => player.y <= gardens.north - 14 + 22);
  turnTo(2 * Math.PI);
  travelUntil(() => player.x >= 300);
  assert.ok(Math.abs(player.y - 266) < 14);
  for (const name of ['Piccadilly', 'Mosley Street', 'Parker Street', 'Portland Street'])
    assert.ok(names.has(name));
});

test('circulating traffic signals before turns and completes repeated laps in mixed traffic', () => {
  const world = createWorld(),
    inputs = new Map(),
    drivers = world.traffic.filter((v) => v.lane === 'gardens');
  assert.ok(drivers.length > 0);
  const laps = new Map(),
    turned = new Set(),
    indicated = new Set();
  for (let i = 0; i < 60 * 160; i++) {
    const previous = drivers.map((v) => ({ ...v }));
    step(world, inputs, dt);
    for (const [j, car] of drivers.entries()) {
      const prev = previous[j];
      assert.ok(Math.hypot(car.x - prev.x, car.y - prev.y) < 1);
      if (car.d < prev.d) laps.set(car.id, (laps.get(car.id) ?? 0) + 1);
      if (car.indicating && car.angle === prev.angle) indicated.add(car.id);
      if (Math.abs(Math.sin(car.angle - prev.angle)) > 0.001) {
        assert.ok(prev.indicating);
        turned.add(car.id);
      }
    }
  }
  for (const car of drivers)
    assert.ok(laps.get(car.id) >= 2 && indicated.has(car.id) && turned.has(car.id));
});

test('a driver on the loop gives way to the Parker Street pedestrian and resumes', () => {
  const world = createWorld(),
    car = world.traffic.find((v) => v.lane === 'gardens');
  Object.assign(car, circuit.pose(circuit.crossing - 1), { d: circuit.crossing - 1, speed: 35 });
  const inputs = new Map();
  for (let i = 0; i < 30; i++) step(world, inputs, dt);
  assert.equal(car.d, circuit.crossing);
  assert.equal(car.speed, 0);
  assert.equal(car.rearLights, 'brake');
  for (let i = 0; i < 210; i++) step(world, inputs, dt);
  assert.ok(car.d > circuit.crossing + 12);
  assert.equal(car.rearLights, 'tail');
});
