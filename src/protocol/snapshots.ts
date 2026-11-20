import type { ChatEvent } from './chat';
import type { World } from '../game/game-types';

export const snapshotPath = '/events';
const encoder = new TextEncoder();

// Unnamed SSE events carry world snapshots. Chat uses a named event on the same stream.
export function encodeSnapshot(world: World) {
  return encoder.encode('data: ' + JSON.stringify(world) + '\n\n');
}

export function decodeSnapshot(data: string): World {
  return JSON.parse(data);
}

export function encodeChat(event: ChatEvent) {
  return encoder.encode('event: chat\ndata: ' + JSON.stringify(event) + '\n\n');
}
