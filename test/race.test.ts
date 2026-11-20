import type { Player, Race, World } from '../public/game-types';
import { expect, test } from 'bun:test';
import { gates, checkGate, raceCommand, withdraw } from '../public/race';
import { createWorld, findRaceGrid, placePlayer, step } from '../public/world';

function room() {
  const world = createWorld();
  for (const id of ['Ada', 'Mo', 'Lee']) world.players.push(placePlayer(id, id, 'red', world)!);
  return world;
}
function command(world: World, who: number, action: Parameters<typeof raceCommand>[2]) {
  return raceCommand(world, world.players[who], action, world.race?.id ?? null, findRaceGrid);
}
function cross(
  race: Race,
  car: Player,
  index: number,
  tick: number,
  { backward = false, offset = 0, fraction = 0.5 } = {},
) {
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
  expect(command(w, 0, 'open')).toBe(undefined);
  expect(command(w, 0, 'join')).toBeTruthy();
  expect(raceCommand(w, b, 'join', 'old-race', findRaceGrid)).toBeTruthy();
  const before = w.players.map((p) => [p.x, p.y]);
  expect(raceCommand(w, b, 'join', w.race!.id, () => null)).toBeTruthy();
  expect(w.players.map((p) => [p.x, p.y])).toStrictEqual(before);
  expect(command(w, 1, 'join')).toBe(undefined);
  expect(w.race!.phase).toBe('countdown');
  expect(command(w, 2, 'join')).toBeTruthy();
  const grid = [a, b].map((p) => [p.x, p.y]),
    initialY = free.y;
  const inputs = new Map(w.players.map((p) => [p.id, 1]));
  for (let i = 0; i < 180; i++) step(w, inputs, 1 / 60);
  expect([a, b].map((p) => [p.x, p.y])).toStrictEqual(grid);
  expect(free.y).not.toBe(initialY);
  for (let i = 0; i < 12; i++) step(w, inputs, 1 / 60);
  expect(w.race!.phase).toBe('racing');
  expect(a.x > grid[0][0] && b.x > grid[1][0]).toBeTruthy();
});

test('skipped, wrong-way and off-road crossings can be recovered; finish order uses sub-tick times', () => {
  const w = room(),
    [a, b, c] = w.players;
  command(w, 0, 'open');
  command(w, 1, 'join');
  const race = w.race!;
  cross(race, a, 0, 1);
  race.phase = 'racing';
  cross(race, a, 4, 4);
  cross(race, a, 0, 5, { backward: true });
  cross(race, a, 0, 6, { offset: 35 });
  cross(race, c, 0, 7);
  expect(race.racers[0].next).toBe(0);
  for (const player of [a, b]) {
    cross(race, player, 0, 8);
    cross(race, player, 2, 9);
    cross(race, player, 4, 10);
    expect(race.racers.find((r) => r.id === player.id)!.next).toBe(1);
    for (let gate = 1; gate <= 3; gate++) cross(race, player, gate, 11 + gate);
  }
  cross(race, a, 4, 20, { fraction: 0.8 });
  cross(race, b, 4, 20, { fraction: 0.2 });
  expect<Race['phase']>(race.phase).toBe('results');
  expect(race.racers.map((r) => r.id)).toStrictEqual([b.id, a.id]);
  expect(Math.abs(race.racers[0].elapsed! - (17 + 0.2 / 60)) < 1e-9).toBeTruthy();
  expect(race.racers[1].elapsed! > race.racers[0].elapsed!).toBeTruthy();
  const previous = race.id;
  expect(command(w, 1, 'open')).toBe(undefined);
  expect(w.race!.id).not.toBe(previous);
  expect(raceCommand(w, b, 'withdraw', previous, findRaceGrid)).toBeTruthy();
});

test('withdrawal releases a grid; departing during the race preserves the other finish', () => {
  const w = room(),
    [a, b] = w.players;
  command(w, 0, 'open');
  command(w, 1, 'join');
  withdraw(w, a.id);
  expect(w.race!.phase).toBe('open');
  expect(w.race!.racers.map((r) => r.id)).toStrictEqual([b.id]);
  command(w, 0, 'join');
  w.race!.phase = 'racing';
  withdraw(w, b.id);
  expect(w.race!.phase).toBe('racing');
  for (let i = 0; i < gates.length; i++) cross(w.race!, a, i, 20 + i);
  expect<Race['phase']>(w.race!.phase).toBe('results');
  expect(w.race!.racers[1].withdrawn).toBe(true);
  expect(w.race!.racers[1].elapsed).toBe(null);
  expect(w.race!.racers[0].elapsed! > 0).toBeTruthy();
});
