import type { Position } from './game-types';
import { JUNCTION } from './streets';

// Curated starting areas, each checked to have clear roads near its centre.
// Centres are world pixels (five per metre) on a street at each area's OpenStreetMap location.
export const startAreas = {
  piccadilly: { name: 'Piccadilly', x: JUNCTION.x, y: JUNCTION.y },
  deansgate: { name: 'Deansgate', x: -1292, y: 3228 },
  ancoats: { name: 'Ancoats', x: 6524, y: 946 },
  etihad: { name: 'The Etihad', x: 13578, y: 1336 },
  salfordQuays: { name: 'Salford Quays', x: -15896, y: 7791 },
  oldTrafford: { name: 'Old Trafford', x: -14406, y: 12521 },
  chorlton: { name: 'Chorlton', x: -10597, y: 24208 },
  didsbury: { name: 'Didsbury', x: 4636, y: 38120 },
  ashtonUnderLyne: { name: 'Ashton-under-Lyne', x: 48451, y: -582 },
} satisfies Record<string, Position & { name: string }>;
export type StartArea = keyof typeof startAreas;

// Accounts can also carry on from where their active vehicle was left.
export type StartChoice = StartArea | 'parked';

export function startChoice(key: unknown): StartChoice {
  return key === 'parked' ? key : startArea(key);
}

export function startArea(key: unknown): StartArea {
  return typeof key === 'string' && Object.hasOwn(startAreas, key) ? (key as StartArea) : 'piccadilly';
}
