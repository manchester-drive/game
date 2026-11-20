import type { GarageOptions } from '../src/game/garage';
import type { Vehicle } from '../src/game/game-types';
import { expect, test } from 'bun:test';
import { furniture, trees } from '../src/game/manchester-map';
import {
  createWorld,
  drive,
  findRaceGrid,
  placePlayer,
  signalPosts,
  step,
  useCar,
  walk,
} from '../src/game/world';
import { raceCommand } from '../src/game/race';

const dt = 1 / 60;
function room(options: GarageOptions = {}) {
  const world = createWorld();
  world.traffic = [];
  world.people = [];
  const player = placePlayer('ada', 'Ada', 'red', world, options)!;
  // Open ground in the gardens, with room to move on either side of the car.
  Object.assign(player, { x: 2506, y: 2468, angle: 0 });
  world.players.push(player);
  return { world, player };
}

test('a player parks, walks away, and must return to their car to drive it again', () => {
  const { world, player } = room({ model: 'van', jacket: 'plum', skin: 'deep' });
  const start = { x: player.x, y: player.y, angle: player.angle };
  expect(useCar(world, player, 'exit')).toBe(undefined);
  const parked = structuredClone(player.parkedCar!);
  expect(parked.model).toBe('van');
  const inputs = new Map([[player.id, 2]]);
  for (let i = 0; i < 45; i++) step(world, inputs, dt);
  expect(player.y > start.y + 30).toBeTruthy();
  expect(player.parkedCar).toStrictEqual(parked);
  expect(useCar(world, player, 'enter')).toBeTruthy();
  expect(raceCommand(world, player, 'open', null, findRaceGrid)).toBeTruthy();
  inputs.set(player.id, 1);
  for (let i = 0; i < 60; i++) step(world, inputs, dt);
  expect(player.y > start.y + 7, 'parked body stops the walker').toBeTruthy();
  expect(useCar(world, player, 'enter')).toBe(undefined);
  expect({ x: player.x, y: player.y, angle: player.angle }).toStrictEqual(start);
  expect(player.parkedCar).toBe(null);
  expect(player.skin).toBe('deep');
  expect(player.jacket).toBe('plum');
  step(world, inputs, dt);
  expect(player.x > start.x).toBeTruthy();
});

test('door checks preserve a moving car or blocked occupant and use a clear alternate side', () => {
  const { world, player } = room();
  player.speed = 24;
  expect(useCar(world, player, 'exit')).toBeTruthy();
  expect(player.speed).toBe(24);
  player.speed = 0;
  const y = player.y;
  world.people = [-1, 1].map((side, i) => ({
    color: 'red',
    route: i,
    next: 1,
    crossing: false,
    id: 'p' + i,
    x: player.x,
    y: y + side * 9,
  }));
  raceCommand(world, player, 'open', null, findRaceGrid);
  expect(useCar(world, player, 'exit')).toBeTruthy();
  expect(player.parkedCar).toBe(null);
  expect(world.race!.racers[0].id).toBe(player.id);
  world.people.shift();
  expect(useCar(world, player, 'exit')).toBe(undefined);
  expect(player.y < y).toBeTruthy();
  expect(world.race).toBe(null);
});

test('a walking player and their parked van both block another driver', () => {
  const { world, player } = room({ model: 'van' });
  useCar(world, player, 'exit');
  const parked = { ...player.parkedCar! };
  player.y += 32;
  const other = placePlayer('mo', 'Mo', 'blue', world)!;
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
    expect(target.x - other.x > 10 && target.x - other.x < 22).toBeTruthy();
  }
  expect(player.parkedCar).toStrictEqual(parked);
});

test('walkers and vehicles stop at trunks, street furniture and crossing lights', () => {
  const targets = [
    { kind: 'tree', x: trees[0][0], y: trees[0][1] },
    signalPosts[0],
    ...['bench', 'bollard', 'busStop', 'bin', 'postBox', 'planter'].map((kind) =>
      furniture.find((f) => f.kind === kind)!,
    ),
    // The Piccadilly fingerpost has open pavement to its west.
    { kind: 'guidepost', x: 3560, y: 2655 },
  ];
  for (const target of targets) {
    const walker = { speed: 0, id: 'walker', x: target.x - 15, y: target.y };
    const car: Vehicle = {
      color: 'red',
      id: 'car',
      x: target.x - 25,
      y: target.y,
      angle: 0,
      speed: 0,
    };
    for (let i = 0; i < 100; i++) {
      walk(walker, 8, dt, [], []);
      drive(car, 1, dt, [], []);
    }
    expect(walker.x > target.x - 10 && walker.x < target.x - 3, target.kind).toBeTruthy();
    expect(car.x > target.x - 18 && car.x < target.x - 10, target.kind).toBeTruthy();
    expect(walker.speed).toBe(0);
    walk(walker, 4, dt, [], []);
    expect(walker.speed > 0).toBeTruthy();
  }
});

test('a speeding coupé hits the Piccadilly bus stop pole and clears it one car width away', () => {
  const stop = { x: 2828, y: 2324 };
  for (const offset of [0, -9]) {
    const car: Vehicle = {
      id: 'coupe',
      color: 'red',
      model: 'coupe',
      x: stop.x - 30,
      y: stop.y + offset,
      angle: 0,
      speed: 154,
    };
    for (let i = 0; i < 18; i++) {
      drive(car, 1, dt, [], []);
      if (offset === 0)
        expect(car.x <= stop.x - 11, 'the bumper passed through the pole').toBeTruthy();
    }
    if (offset === 0) expect(car.speed < 20, 'the impact should absorb speed').toBeTruthy();
    else expect(car.x > stop.x + 12).toBeTruthy();
  }
});

test('a walker can pass under a tree crown and approach its trunk from the north', () => {
  const trunk = { x: 2691, y: 2315 };
  const walker = { speed: 0, x: trunk.x - 13, y: trunk.y - 8 };
  for (let i = 0; i < 20; i++) walk(walker, 8, dt, [], []);
  expect(Math.abs(walker.x - trunk.x) < 0.01).toBeTruthy();
  for (let i = 0; i < 20; i++) walk(walker, 2, dt, [], []);
  expect(walker.y > trunk.y - 5 && walker.y < trunk.y - 4).toBeTruthy();
  expect(walker.speed).toBe(0);
});
