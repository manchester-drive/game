import { expect, test } from 'bun:test';
import { chatHistoryLimit } from '../src/protocol/chat';
import { GameRoom } from '../src/server/room';

test('idle controls are released, then the player and their open race leave the room', () => {
  let now = 0;
  const room = new GameRoom(() => now);
  const joined = room.join('Ada');
  if ('error' in joined) throw new Error(joined.error);
  const session = room.sessionFor(joined.token)!;
  room.race(session, { action: 'open', raceId: null });
  expect(room.world.race?.racers[0].id).toBe(joined.id);

  now = 1000;
  room.input(session, { seq: 1, keys: 1, onFoot: false });
  const frames: number[] = [];
  const advance = () => room.advance(4 / 60, (world) => frames.push(world.time));
  advance();
  const movingSpeed = session.player.speed;
  expect(movingSpeed).toBeGreaterThan(0);
  expect(frames).toHaveLength(1);
  expect(frames[0]).toBeCloseTo(4 / 60);

  now += 2501;
  advance();
  expect(session.player.speed).toBeLessThan(movingSpeed);
  expect(room.world.players).toHaveLength(1);

  // Replaying the old input cannot keep a disconnected player in the room.
  room.input(session, { seq: 1, keys: 1, onFoot: false });
  now = 16_001;
  advance();
  expect(room.sessionFor(joined.token)).toBeUndefined();
  expect(room.world.players).toHaveLength(0);
  expect(room.world.race).toBeNull();
});

test('recent chat history rolls over in send order and is local to the running room', () => {
  const room = new GameRoom();
  const player = room.join('Mo');
  if ('error' in player) throw new Error(player.error);
  const session = room.sessionFor(player.token)!;
  const messages = Array.from({ length: chatHistoryLimit + 2 }, (_, i) =>
    room.chat(session, String(i)),
  );
  expect(room.chatHistory).toEqual(messages.slice(2));
  expect(new GameRoom().chatHistory).toEqual([]);
});
