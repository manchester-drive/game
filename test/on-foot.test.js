import assert from 'node:assert/strict';
import test from 'node:test';
import { furniture, trees } from '../public/manchester-map.js';
import {
  createWorld,
  drive,
  findRaceGrid,
  placePlayer,
  signalPosts,
  step,
  useCar,
  walk,
} from '../public/world.js';
import { raceCommand } from '../public/race.js';

const dt = 1 / 60;
function room(options = {}) {
  const world = createWorld();
  world.traffic = [];
  world.people = [];
  const player = placePlayer('ada', 'Ada', 'red', world, options);
  // Open ground in the gardens, with room to move on either side of the car.
  Object.assign(player, { x: 2506, y: 2468, angle: 0 });
  world.players.push(player);
  return { world, player };
}

test('a player parks, walks away, and must return to their car to drive it again', () => {
  const { world, player } = room({ model: 'van', jacket: 'plum', skin: 'deep' });
  const start = { x: player.x, y: player.y, angle: player.angle };
  assert.equal(useCar(world, player, 'exit'), undefined);
  const parked = structuredClone(player.parkedCar);
  assert.equal(parked.model, 'van');
  const inputs = new Map([[player.id, 2]]);
  for (let i = 0; i < 45; i++) step(world, inputs, dt);
  assert.ok(player.y > start.y + 30);
  assert.deepEqual(player.parkedCar, parked);
  assert.ok(useCar(world, player, 'enter'));
  assert.ok(raceCommand(world, player, 'open', null, findRaceGrid));
  inputs.set(player.id, 1);
  for (let i = 0; i < 60; i++) step(world, inputs, dt);
  assert.ok(player.y > start.y + 7, 'parked body stops the walker');
  assert.equal(useCar(world, player, 'enter'), undefined);
  assert.deepEqual({ x: player.x, y: player.y, angle: player.angle }, start);
  assert.equal(player.parkedCar, null);
  assert.equal(player.skin, 'deep');
  assert.equal(player.jacket, 'plum');
  step(world, inputs, dt);
  assert.ok(player.x > start.x);
});

test('door checks preserve a moving car or blocked occupant and use a clear alternate side', () => {
  const { world, player } = room();
  player.speed = 24;
  assert.ok(useCar(world, player, 'exit'));
  assert.equal(player.speed, 24);
  player.speed = 0;
  const y = player.y;
  world.people = [-1, 1].map((side, i) => ({ id: 'p' + i, x: player.x, y: y + side * 9 }));
  raceCommand(world, player, 'open', null, findRaceGrid);
  assert.ok(useCar(world, player, 'exit'));
  assert.equal(player.parkedCar, null);
  assert.equal(world.race.racers[0].id, player.id);
  world.people.shift();
  assert.equal(useCar(world, player, 'exit'), undefined);
  assert.ok(player.y < y);
  assert.equal(world.race, null);
});

test('a walking player and their parked van both block another driver', () => {
  const { world, player } = room({ model: 'van' });
  useCar(world, player, 'exit');
  const parked = { ...player.parkedCar };
  player.y += 32;
  const other = placePlayer('mo', 'Mo', 'blue', world);
  world.players.push(other);
  for (const target of [player, parked]) {
    Object.assign(other, {
      x: target.x - 40,
      y: target.y,
      angle: 0,
      speed: 60,
      slideX: 0,
      slideY: 0,
    });
    for (let i = 0; i < 90; i++) step(world, new Map([['mo', 1]]), dt);
    assert.ok(target.x - other.x > 10 && target.x - other.x < 22);
  }
  assert.deepEqual(player.parkedCar, parked);
});

test('walkers and vehicles stop at trunks, street furniture and crossing lights', () => {
  const targets = [
    { x: trees[0][0], y: trees[0][1] },
    signalPosts[0],
    ...['bench', 'bollard', 'busStop', 'bin', 'postBox', 'planter'].map((kind) =>
      furniture.find((f) => f.kind === kind),
    ),
    // The Piccadilly fingerpost has open pavement to its west.
    { kind: 'guidepost', x: 3560, y: 2655 },
  ];
  for (const target of targets) {
    const walker = { id: 'walker', x: target.x - 15, y: target.y };
    const car = { id: 'car', x: target.x - 25, y: target.y, angle: 0, speed: 0 };
    for (let i = 0; i < 100; i++) {
      walk(walker, 8, dt, [], []);
      drive(car, 1, dt, [], []);
    }
    assert.ok(walker.x > target.x - 10 && walker.x < target.x - 3, target.kind);
    assert.ok(car.x > target.x - 18 && car.x < target.x - 10, target.kind);
    assert.equal(walker.speed, 0);
    walk(walker, 4, dt, [], []);
    assert.ok(walker.speed > 0);
  }
});

test('a speeding coupé hits the Piccadilly bus stop pole and clears it one car width away', () => {
  const stop = { x: 2828, y: 2324 };
  for (const offset of [0, -9]) {
    const car = { model: 'coupe', x: stop.x - 30, y: stop.y + offset, angle: 0, speed: 154 };
    for (let i = 0; i < 18; i++) {
      drive(car, 1, dt, [], []);
      if (offset === 0) assert.ok(car.x <= stop.x - 11, 'the bumper passed through the pole');
    }
    if (offset === 0) assert.ok(car.speed < 20, 'the impact should absorb speed');
    else assert.ok(car.x > stop.x + 12);
  }
});

test('a walker can pass under a tree crown and approach its trunk from the north', () => {
  const trunk = { x: 2691, y: 2315 };
  const walker = { x: trunk.x - 13, y: trunk.y - 8 };
  for (let i = 0; i < 20; i++) walk(walker, 8, dt, [], []);
  assert.ok(Math.abs(walker.x - trunk.x) < 0.01);
  for (let i = 0; i < 20; i++) walk(walker, 2, dt, [], []);
  assert.ok(walker.y > trunk.y - 5 && walker.y < trunk.y - 4);
  assert.equal(walker.speed, 0);
});
