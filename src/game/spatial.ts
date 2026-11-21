import type { Position } from './game-types';

export interface CellBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function cellsAround(
  p: Position,
  halfWidth: number,
  halfHeight: number,
  size: number,
): CellBounds {
  return {
    left: Math.floor((p.x - halfWidth) / size),
    right: Math.floor((p.x + halfWidth) / size),
    top: Math.floor((p.y - halfHeight) / size),
    bottom: Math.floor((p.y + halfHeight) / size),
  };
}

// Integer cell coordinates in the M60 region fit well inside a 16-bit span per axis.
export function cellKey(col: number, row: number) {
  return col * 65536 + row;
}

export class SpatialGrid<T extends Position> {
  private readonly buckets = new Map<number, Set<T>>();
  private readonly membership = new Map<T, number>();

  constructor(
    private readonly size: number,
    items: T[],
  ) {
    for (const item of items) this.update(item);
  }

  update(item: T) {
    const key = cellKey(Math.floor(item.x / this.size), Math.floor(item.y / this.size));
    const previous = this.membership.get(item);
    if (previous === key) return;
    if (previous !== undefined) this.buckets.get(previous)!.delete(item);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new Set();
      this.buckets.set(key, bucket);
    }
    bucket.add(item);
    this.membership.set(item, key);
  }

  inCells(area: CellBounds) {
    const found: T[] = [];
    for (let col = area.left; col <= area.right; col++) {
      for (let row = area.top; row <= area.bottom; row++) {
        const bucket = this.buckets.get(cellKey(col, row));
        if (bucket) for (const item of bucket) found.push(item);
      }
    }
    return found;
  }

  near(p: Position, radius: number) {
    return this.inCells(cellsAround(p, radius, radius, this.size));
  }
}
