import { expect, test } from 'bun:test';
import type { Vehicle } from '../src/game/game-types';
import { models } from '../src/game/garage';
import { drive } from '../src/game/world';
import { useServerMap } from '../src/server/map';

test('a speeding coupé stops bumper-first at the Gardens fountain and can reverse away', () => {
  // The southwest bank passes through (2585, 2489) at 45 degrees.
  const normal = Math.SQRT1_2;
  const car: Vehicle = {
    id: 'car',
    color: 'red',
    model: 'coupe',
    x: 2585 - 30 * normal,
    y: 2489 + 30 * normal,
    angle: -Math.PI / 4,
    speed: models.coupe.topSpeed,
  };
  const clearance = () => (2585 - car.x + (car.y - 2489)) * normal - models.coupe.length;
  for (let i = 0; i < 90; i++) {
    drive(car, 1, 1 / 60, [], []);
    expect(clearance()).toBeGreaterThanOrEqual(0);
  }
  expect(clearance()).toBeLessThan(1);
  for (let i = 0; i < 48; i++) drive(car, 2, 1 / 60, [], []);
  expect(clearance()).toBeGreaterThan(10);
});

test('cars cross the Irwell on Blackfriars Bridge in both directions and stay on the deck when shoved', () => {
  useServerMap();
  const length = Math.hypot(156, 131),
    ux = -156 / length,
    uy = -131 / length;
  // The mapped deck runs from (-866, 1009) to (-1022, 878) and is 32 pixels wide.
  const centre = { x: -944, y: 943.5 };
  for (const direction of [-1, 1]) {
    const start = -(length / 2 + 22) * direction;
    const car: Vehicle = {
      id: 'van',
      color: 'red',
      model: 'van',
      x: centre.x + ux * start,
      y: centre.y + uy * start,
      angle: Math.atan2(uy * direction, ux * direction),
      speed: 50,
    };
    for (let i = 0; i < 160; i++) drive(car, 1, 1 / 60, [], []);
    const along = (car.x - centre.x) * ux + (car.y - centre.y) * uy;
    expect(along * direction).toBeGreaterThan(length / 2 + 14);
  }

  const van: Vehicle = {
    ...centre,
    id: 'van',
    color: 'red',
    model: 'van',
    angle: Math.atan2(uy, ux),
    speed: 0,
    slideX: -uy * 140,
    slideY: ux * 140,
  };
  let furthest = 0;
  for (let i = 0; i < 90; i++) {
    drive(van, 0, 1 / 60, [], []);
    furthest = Math.max(furthest, (van.y - centre.y) * ux - (van.x - centre.x) * uy);
  }
  expect(furthest).toBeWithin(9, 16 - models.van.width);
});

test('dry land inside a lake polygon remains drivable', () => {
  useServerMap();
  // Start on an island in the boating lake at Heaton Park.
  const car: Vehicle = {
    id: 'car',
    color: 'red',
    x: -3816,
    y: -24881,
    angle: Math.PI / 2,
    speed: 50,
  };
  for (let i = 0; i < 30; i++) drive(car, 1, 1 / 60, [], []);
  expect(car.y).toBeGreaterThan(-24850);
});
