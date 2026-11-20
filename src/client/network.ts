import type { ChatEvent } from '../protocol/chat';
import type { World } from '../game/game-types';
import type { Commands, Credentials } from '../protocol/commands';
import { decodeSnapshot, snapshotPath } from '../protocol/snapshots';

type Reply<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };
export async function post<P extends keyof Commands>(
  path: P,
  data: Commands[P],
): Promise<Reply<P extends '/join' ? Credentials : object>> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = (await response.json()) as { error: string };
    return { ok: false, status: response.status, error: body.error };
  }
  return { ok: true, status: response.status, data: await response.json() };
}

export function subscribeToRoom(
  onSnapshot: (world: World) => void,
  onChat: (update: ChatEvent) => void,
  onDisconnect: () => void,
) {
  const events = new EventSource(snapshotPath);
  events.addEventListener('chat', (event) => onChat(JSON.parse(event.data)));
  events.onerror = onDisconnect;
  events.onmessage = (event) => onSnapshot(decodeSnapshot(event.data));
}

export function leaveOnPageHide(token: string) {
  navigator.sendBeacon('/leave', JSON.stringify({ token } satisfies Commands['/leave']));
}
