import type { Position } from '../game/game-types';
import { cellsAround, type CellBounds } from '../game/spatial';

export const viewCellSize = 256;
const margin = 128;
export const maxViewSpan = 32;
export function cameraCells(focus: Position, width: number, height: number) {
  const maxHalf = ((maxViewSpan - 1) * viewCellSize) / 2 - 1;
  return cellsAround(
    focus,
    Math.min(width / 2 + margin, maxHalf),
    Math.min(height / 2 + margin, maxHalf),
    viewCellSize,
  );
}

export function areaKey({ left, right, top, bottom }: CellBounds) {
  return [left, right, top, bottom].join(',');
}
