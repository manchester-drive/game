import type { MapData, Point, Road } from './map-types';
import { areas, buildings, roads, paths, width, height } from './manchester-map';
import manifest from './map/region.json';

export const chunkSize = manifest.chunkSize;
export const mapVersion = manifest.version;
export const boundary = manifest.boundary as Point[];
export type MapChunk = Pick<MapData, 'roads' | 'paths' | 'buildings' | 'areas' | 'trees'>;
export const emptyChunk: MapChunk = { roads: [], paths: [], buildings: [], areas: [], trees: [] };

export type NamedStreet = Pick<Road, 'name' | 'points' | 'width' | 'oneway'>;
export function namedStreets(chunk: MapChunk): NamedStreet[] {
  const streets: NamedStreet[] = chunk.roads.filter((road) => road.name);
  for (const path of chunk.paths) {
    if (path.name) streets.push({ ...path, name: path.name, oneway: 0 });
  }
  return streets;
}

const coreChunks = new Map<string, MapChunk>();
const loaded = new Map<string, MapChunk>();
let load: (key: string) => MapChunk | undefined = () => undefined;

export function setMapLoader(loader: typeof load) {
  loaded.clear();
  load = loader;
}
export function storeChunk(key: string, chunk: Partial<MapChunk>) {
  const complete = { ...emptyChunk, ...chunk };
  loaded.set(key, complete);
  if (loaded.size > 40) loaded.delete(loaded.keys().next().value!);
  return complete;
}

export function overlapsTile(
  points: Point[],
  left: number,
  top: number,
  size: number,
  pad: number,
) {
  return (
    points.some(([x]) => x >= left - pad) &&
    points.some(([x]) => x <= left + size + pad) &&
    points.some(([, y]) => y >= top - pad) &&
    points.some(([, y]) => y <= top + size + pad)
  );
}

export function mapChunk(x: number, y: number): MapChunk | undefined {
  const col = Math.floor(x / chunkSize),
    row = Math.floor(y / chunkSize);
  const key = col + ',' + row;
  const left = col * chunkSize,
    top = row * chunkSize;
  if (left >= 0 && top >= 0 && left + chunkSize <= width && top + chunkSize <= height) {
    let core = coreChunks.get(key);
    if (!core) {
      const visible = (p: Point[]) => overlapsTile(p, left, top, chunkSize, 128);
      core = {
        roads: roads.filter((r) => visible(r.points)),
        areas: areas.filter((a) => visible(a.points)),
        buildings: buildings.filter((b) => visible(b.rings.flat())),
        paths: paths.filter((p) => visible(p.points)),
        trees: [], // The central district's trees and furniture are bundled with the race.
      };
      coreChunks.set(key, core);
    }
    return core;
  }
  const cached = loaded.get(key);
  if (!cached) return load(key);
  loaded.delete(key);
  loaded.set(key, cached);
  return cached;
}

// Index ray crossings by horizontal band. Most simulation ticks are far inside the orbital.
const bands = new Map<number, [Point, Point][]>();
for (let i = 0; i < boundary.length; i++) {
  const a = boundary[i],
    b = boundary[(i + 1) % boundary.length];
  for (
    let row = Math.floor(Math.min(a[1], b[1]) / chunkSize);
    row <= Math.floor(Math.max(a[1], b[1]) / chunkSize);
    row++
  ) {
    if (!bands.has(row)) bands.set(row, []);
    bands.get(row)!.push([a, b]);
  }
}

export function insideM60(x: number, y: number) {
  let inside = false;
  for (const [[ax, ay], [bx, by]] of bands.get(Math.floor(y / chunkSize)) ?? []) {
    if (ay > y !== by > y && x < ax + ((bx - ax) * (y - ay)) / (by - ay)) inside = !inside;
  }
  return inside;
}

export function pointInRing(x: number, y: number, ring: Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i],
      [bx, by] = ring[j];
    if (ay > y !== by > y && x < ax + ((bx - ax) * (y - ay)) / (by - ay)) inside = !inside;
  }
  return inside;
}

export function closestBoundaryPoint(x: number, y: number, rings: Point[][]) {
  let nearest = { x, y },
    best = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i],
        [bx, by] = ring[(i + 1) % ring.length];
      const dx = bx - ax,
        dy = by - ay;
      const t = Math.max(
        0,
        Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)),
      );
      const px = ax + dx * t,
        py = ay + dy * t,
        distance = (px - x) ** 2 + (py - y) ** 2;
      if (distance < best) {
        best = distance;
        nearest = { x: px, y: py };
      }
    }
  }
  return nearest;
}

export function clampToM60(x: number, y: number) {
  return insideM60(x, y) ? { x, y } : closestBoundaryPoint(x, y, [boundary]);
}
