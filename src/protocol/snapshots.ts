import type { World } from '../game/game-types';

export const snapshotPath = '/events';
const encoder = new TextEncoder();

// Each SSE message carries one complete public world, including the initial frame on connect.
export function encodeSnapshot(world: World) {
  return encoder.encode('data: ' + JSON.stringify(world) + '\n\n');
}

export function decodeSnapshot(data: string): World {
  return JSON.parse(data);
}
