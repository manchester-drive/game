import { expect, test } from 'bun:test';
import { startAreas } from '../src/game/areas';
import type { Vehicle } from '../src/game/game-types';
import { livery } from '../src/game/garage';
import { createWorld, roadUsers, step } from '../src/game/world';
import { cameraCells } from '../src/protocol/view';
import { decodeSnapshot } from '../src/protocol/snapshots';
import { useServerMap } from '../src/server/map';
import { neighbourhoodFrames } from '../src/server/neighbourhoods';
import { GameRoom } from '../src/server/room';
import { populateStreetCars } from '../src/server/street-cars';

test('every starting district has a mix of available street vehicles', () => {
  useServerMap();
  const world = createWorld();
  populateStreetCars(world);
  for (const centre of Object.values(startAreas)) {
    const nearby = world.streetCars.filter(c => Math.hypot(c.x - centre.x, c.y - centre.y) <= 1200);
    expect(new Set(nearby.map(c => c.model)), centre.name).toEqual(new Set(['hatch', 'coupe', 'van', 'cab']));
  }
  expect(new Set(world.streetCars.map(c => c.id)).size).toBe(world.streetCars.length);
});

test('drivers share street vehicles while their personal cars keep their spots and liveries', () => {
  useServerMap();
  const room = new GameRoom();
  const { world } = room;
  world.traffic = [];
  world.people = [];
  const ride = livery({ model: 'van', paint: 'sky', stripe: 'gold', plate: 'ADA' });
  function join(name: string, x: number) {
    const credentials = room.join(name, {}, [[x, 2468, 0]], { userId: name, vehicleId: name, livery: ride });
    if ('error' in credentials) throw Error(credentials.error);
    return room.sessionFor(credentials.token)!;
  }
  const ada = join('Ada', 2506), mo = join('Mo', 2460);
  const cab: Vehicle = {
    id: 'street-cab', x: 2550, y: 2468, angle: 0, speed: 0, color: '#303439',
    model: 'cab', parked: true, shared: true,
  };
  world.streetCars.push(cab);
  expect(room.vehicle(ada, { seq: 1, action: 'exit' })).toBeUndefined();
  expect(room.vehicle(mo, { seq: 1, action: 'exit' })).toBeUndefined();
  const van = ada.player.parkedCar!, moVan = mo.player.parkedCar!;
  const ownDoor = { x: ada.player.x, y: ada.player.y };
  Object.assign(mo.player, ownDoor);
  expect(room.vehicle(mo, { seq: 2, action: 'enter', targetId: van.id })).toBeString();
  Object.assign(ada.player, { x: cab.x, y: cab.y + 10 });
  Object.assign(mo.player, { x: cab.x, y: cab.y - 10 });
  expect(room.vehicle(ada, { seq: 2, action: 'enter', targetId: cab.id })).toBeUndefined();
  expect(room.vehicle(mo, { seq: 3, action: 'enter', targetId: cab.id })).toBeString();
  expect(ada.player).toMatchObject({ model: 'cab', color: cab.color, parkedCar: null });
  expect(ada.player.plate).toBeUndefined();
  const frame = neighbourhoodFrames(world)(cameraCells(ada.player, 500, 300), ada.player);
  const snapshot = decodeSnapshot(new TextDecoder().decode(frame).slice(6).trim());
  expect(snapshot.players.find(p => p.id === ada.player.id)).toMatchObject({ model: 'cab', parkedCarId: null });
  expect(snapshot.parkedCars.map(c => c.id).sort()).toEqual([van.id, moVan.id].sort());
  expect(roadUsers(world).vehicles).toContain(van);

  const saved = new Map<string, { x: number; y: number; angle: number }>();
  room.onPark = (_, id, pose) => { saved.set(id, pose); };
  const accelerate = new Map([[ada.player.id, 1]]);
  for (let i = 0; i < 15; i++) step(world, accelerate, 1 / 60);
  expect(ada.player.x).toBeGreaterThan(cab.x);
  room.parkAll();
  expect(saved.get('Ada')).toEqual({ x: van.x, y: van.y, angle: van.angle });
  expect(room.vehicle(ada, { seq: 3, action: 'exit' })).toBeString();
  ada.player.speed = 0;
  expect(room.vehicle(ada, { seq: 4, action: 'exit' })).toBeUndefined();
  const released = world.streetCars[0];
  expect(released).toMatchObject({ id: cab.id, model: 'cab', parked: true, shared: true });
  expect(released.x).toBeGreaterThan(cab.x);
  Object.assign(ada.player, ownDoor);
  expect(room.vehicle(ada, { seq: 5, action: 'enter', targetId: van.id })).toBeUndefined();
  expect(ada.player).toMatchObject({ model: 'van', color: van.color, stripe: van.stripe, plate: 'ADA' });
  expect(room.vehicle(mo, { seq: 4, action: 'enter', targetId: cab.id })).toBeUndefined();
  room.leave(mo);
  expect(saved.get('Mo')).toEqual({ x: moVan.x, y: moVan.y, angle: moVan.angle });
  expect(world.streetCars).toEqual([released]);
});
