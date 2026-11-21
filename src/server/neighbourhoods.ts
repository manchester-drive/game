import type { Player, Position, World } from '../game/game-types';
import { cellKey, SpatialGrid, type CellBounds } from '../game/spatial';
import { encodeSnapshot } from '../protocol/snapshots';
import { areaKey, cameraCells, viewCellSize } from '../protocol/view';

// A single simulation owns every NPC. Cameras with the same coverage share encoded frames.
export function neighbourhoodFrames(world: World) {
  const cars = new SpatialGrid(viewCellSize, world.traffic);
  const people = new SpatialGrid(viewCellSize, world.people);
  const frames = new Map<string, Uint8Array>();
  return (camera: CellBounds, driver?: Player) => {
    const local = driver && cameraCells(driver, 0, 0);
    const extra =
      local &&
      (local.left < camera.left ||
        local.right > camera.right ||
        local.top < camera.top ||
        local.bottom > camera.bottom)
        ? local
        : undefined;
    const key = extra ? areaKey(camera) + '/' + areaKey(extra) : areaKey(camera);
    let frame = frames.get(key);
    if (!frame) {
      function visible<T extends Position>(grid: SpatialGrid<T>) {
        const inView = grid.inCells(camera);
        return extra ? [...new Set([...inView, ...grid.inCells(extra)])] : inView;
      }
      frame = encodeSnapshot({ ...world, traffic: visible(cars), people: visible(people) });
      frames.set(key, frame);
    }
    return frame;
  };
}

// Wake one extra row of cells before an NPC becomes visible or reaches a player.
export function activeCells(views: Iterable<CellBounds>, players: Player[]) {
  const active = new Set<number>();
  const included = new Set<string>();
  function include(area: CellBounds) {
    const key = areaKey(area);
    if (included.has(key)) return;
    included.add(key);
    for (let col = area.left - 1; col <= area.right + 1; col++) {
      for (let row = area.top - 1; row <= area.bottom + 1; row++) active.add(cellKey(col, row));
    }
  }
  for (const view of views) include(view);
  for (const player of players) include(cameraCells(player, 0, 0));
  return active;
}
