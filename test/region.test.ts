import { expect, test } from 'bun:test';
import { insideRegion, clampToRegion, mapChunk } from '../src/game/region';
import { streetAt } from '../src/game/streets';
import { walk, drive } from '../src/game/world';
import { useServerMap } from '../src/server/map';

// Points on OSM mainline segments at Eccles, Simister, Ashton and the Mersey.
const carriageways = [
  [-46317, -6928, 0, -88],
  [-7392, -34405, -732, 354],
  [42989, 522.5, 10, 245],
  [4340, 48487.5, -194, -3],
];

test('the M60 mainline is playable on all four sides of Manchester', () => {
  useServerMap();
  for (const [x, y, dx, dy] of carriageways) {
    expect(insideRegion(x, y)).toBe(true);
    expect(streetAt(x, y)).toBe('M60');
    const car = { id: 'driver', x, y, angle: Math.atan2(dy, dx), speed: 30, color: 'red' };
    for (let tick = 0; tick < 30; tick++) drive(car, 1, 1 / 60, [], []);
    expect(Math.hypot(car.x - x, car.y - y)).toBeGreaterThan(15);
  }
});

test('Old Street in Ashton-under-Lyne town centre is inside the playable map', () => {
  useServerMap();
  expect(insideRegion(48451, -582)).toBe(true);
  expect(streetAt(48451, -582)).toBe('Old Street');
});

test('the regional boundary stops walking and driving and limits free cam at the same edge', () => {
  useServerMap();
  const outside = { x: -47500, y: -6928 };
  expect(insideRegion(outside.x, outside.y)).toBe(false);
  const edge = clampToRegion(outside.x, outside.y);
  const walker = { x: edge.x + 20, y: edge.y };
  const car = { ...walker, angle: Math.PI, id: 'driver', speed: 30, color: 'red' };
  for (let tick = 0; tick < 120; tick++) {
    walk(walker, 4, 1 / 60, [], []);
    drive(car, 1, 1 / 60, [], []);
  }
  expect(walker.x - edge.x).toBeWithin(2, 4);
  expect(car.x - edge.x).toBeWithin(9, 12);
  expect(insideRegion(-43000, 45000)).toBe(false); // Inside the bounding rectangle, outside the ring.
});

test('central trunk carriageways and outlying building walls come from the map', () => {
  useServerMap();
  expect(streetAt(4250, 626)).toBe('Great Ancoats Street');
  expect(streetAt(1766, 1886)).toBe('Market Street');
  const roads = mapChunk(4250, 626)!.roads.filter((r) => r.name === 'Great Ancoats Street');
  expect(roads.some((r) => r.oneway && r.lanes >= 2)).toBe(true);
  // The east-facing wall of Adidas in Trafford Park, well outside the original map.
  const walker = { x: -23040, y: 13400 };
  for (let tick = 0; tick < 90; tick++) walk(walker, 4, 1 / 60, [], []);
  expect(walker.x).toBeWithin(-23055, -23048);
});
