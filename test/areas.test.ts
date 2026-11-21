import { expect, test } from 'bun:test';
import { startAreas, type StartArea } from '../src/game/areas';
import { createWorld, placePlayer } from '../src/game/world';
import { startingPositions } from '../src/game/streets';
import { useServerMap } from '../src/server/map';

useServerMap();

test('players spawn on a clear street near each starting area', () => {
  for (const key of Object.keys(startAreas) as StartArea[]) {
    const world = createWorld();
    const area = startAreas[key];
    const player = placePlayer('ada', 'Ada', 'red', world, {}, startingPositions(area));
    expect(player).not.toBeNull();
    const metres = Math.hypot(player!.x - area.x, player!.y - area.y) / 5;
    expect(metres, key).toBeLessThan(100);
  }
});
