import { gates } from './streets.js';
export { gates };

function entrant(player) {
  return { id: player.id, name: player.name, next: 0, elapsed: null, withdrawn: false };
}
export function raceEntry(race, id) {
  return race?.racers.find((r) => r.id === id);
}
export function heldOnGrid(race, id) {
  return race?.phase === 'countdown' && !!raceEntry(race, id);
}
function settle(race) {
  if (race.racers.every((r) => r.elapsed !== null || r.withdrawn)) race.phase = 'results';
}
export function withdraw(world, id) {
  const race = world.race,
    entry = raceEntry(race, id);
  if (!entry || entry.withdrawn || entry.elapsed !== null) return;
  if (race.phase === 'open' || race.phase === 'countdown') {
    race.racers = race.racers.filter((r) => r.id !== id);
    race.phase = 'open';
    race.startAt = null;
    if (!race.racers.length) world.race = null;
  } else {
    entry.withdrawn = true;
    settle(race);
  }
}

// Commands arrive with the race ID shown to the driver, to reject stale clicks.
export function raceCommand(world, player, action, raceId, findGrid) {
  const race = world.race;
  if (raceId !== (race?.id ?? null)) return 'The race has changed. Try again.';
  const entry = raceEntry(race, player.id);
  if (action === 'open' && (!race || race.phase === 'results')) {
    world.race = {
      id: crypto.randomUUID(),
      phase: 'open',
      startAt: null,
      racers: [entrant(player)],
    };
    return;
  }
  if (action === 'join' && race?.phase === 'open' && !entry) {
    const racers = [...race.racers, entrant(player)];
    const grid = findGrid(world, racers);
    if (!grid) return 'Traffic is blocking the starting grid. Try again shortly.';
    for (const [i, r] of racers.entries()) {
      const car = world.players.find((p) => p.id === r.id);
      Object.assign(car, grid[i], {
        speed: 0,
        slideX: 0,
        slideY: 0,
        rearLights: 'brake',
      });
    }
    Object.assign(race, { racers, startAt: world.time + 3, phase: 'countdown' });
    return;
  }
  if (action === 'withdraw' && entry && !entry.withdrawn && entry.elapsed === null) {
    withdraw(world, player.id);
    return;
  }
  return 'That race action is no longer available.';
}

export function checkGate(race, car, fromX, fromY, tickStart, dt) {
  if (race?.phase !== 'racing') return;
  const entry = raceEntry(race, car.id);
  if (!entry || entry.withdrawn || entry.elapsed !== null) return;
  const g = gates[entry.next];
  const before = (fromX - g.x) * g.dx + (fromY - g.y) * g.dy;
  const after = (car.x - g.x) * g.dx + (car.y - g.y) * g.dy;
  if (before >= 0 || after < 0) return;
  const fraction = -before / (after - before);
  const x = fromX + fraction * (car.x - fromX),
    y = fromY + fraction * (car.y - fromY);
  if (Math.abs((x - g.x) * g.dy - (y - g.y) * g.dx) > g.halfWidth) return;
  entry.next++;
  if (entry.next === gates.length) {
    entry.elapsed = tickStart + fraction * dt - race.startAt;
    // Crossing time orders finishes even when two cars cross within one tick.
    race.racers.sort((a, b) => (a.elapsed ?? Infinity) - (b.elapsed ?? Infinity));
    settle(race);
  }
}
