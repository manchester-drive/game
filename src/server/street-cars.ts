import { startAreas } from '../game/areas';
import type { Vehicle, World } from '../game/game-types';
import { paints, stripes, trims, type ModelKey } from '../game/garage';
import { circuits, spawns, startingPositions } from '../game/streets';
import { canPark, exitDoor, roadUsers } from '../game/world';

function pick<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

const fleet: ModelKey[] = ['hatch', 'van', 'coupe', 'cab', 'hatch', 'van'];
const paintColours = Object.values(paints);
const roofColours = Object.values(trims);
const stripeColours = Object.values(stripes);

export function populateStreetCars(world: World) {
  if (world.streetCars.length || world.players.some(player => player.borrowed)) return;
  const { vehicles, people } = roadUsers(world);
  for (const [area, centre] of Object.entries(startAreas)) {
    const bays = Array.from(startingPositions(centre).take(350))
      .filter(([x, y]) => Math.hypot(centre.x - x, centre.y - y) < 1200);
    // Put the first car within a short walk of the usual spawn when space allows.
    if (!bays.length) continue;
    const [startX, startY] = bays[0];
    const nearSpawn = bays.filter(([x, y]) => Math.hypot(x - startX, y - startY) <= 300);
    const firstStyle = Math.floor(Math.random() * fleet.length);
    let count = 0;
    while (count < fleet.length && bays.length) {
      const pool = count === 0 && nearSpawn.length ? nearSpawn : bays;
      const index = Math.floor(Math.random() * pool.length);
      const [x, y, angle] = pool[index];
      pool[index] = pool[pool.length - 1];
      pool.pop();
      if (Math.hypot(x - startX, y - startY) < 36) continue;
      // Keep the starting bays and the NPC and race circuits clear.
      if (spawns.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 36)) continue;
      if (circuits.some(route => {
        const point = route.pose(route.nearest(x, y));
        return Math.hypot(point.x - x, point.y - y) < 32;
      })) continue;
      if (world.streetCars.some(car => Math.hypot(car.x - x, car.y - y) < 65)) continue;
      const model = fleet[(count + firstStyle) % fleet.length];
      const car: Vehicle = {
        id: 'street-' + area + '-' + count, x, y, angle, model,
        color: model === 'cab' ? '#303439' : pick(paintColours),
        roof: model === 'cab' ? undefined : pick(roofColours) || undefined,
        stripe: model === 'cab' ? undefined : pick(stripeColours) || undefined,
        speed: 0, parked: true, shared: true,
      };
      if (!canPark(car, vehicles, people) || !exitDoor(car, vehicles, people)) continue;
      world.streetCars.push(car);
      vehicles.push(car);
      count++;
    }
  }
}
