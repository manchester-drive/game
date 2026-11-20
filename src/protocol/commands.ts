import { z } from 'zod';
import type { Appearance } from '../game/garage';

export interface Credentials {
  id: string;
  token: string;
}

export const inputCommand = z.object({
  seq: z.int(),
  keys: z.int().min(0).max(15),
  onFoot: z.boolean().default(false),
});
export const doorCommand = z.object({ seq: z.int(), action: z.enum(['enter', 'exit']) });
export const raceCommandBody = z.object({
  action: z.enum(['open', 'join', 'withdraw']),
  raceId: z.string().nullable(),
});

export type InputCommand = z.output<typeof inputCommand>;
export type DoorCommand = z.output<typeof doorCommand>;
export type RaceCommand = z.output<typeof raceCommandBody>;

type Token = Pick<Credentials, 'token'>;
export interface Commands {
  '/join': Appearance & { name: string };
  '/leave': Token;
  '/input': Token & z.input<typeof inputCommand>;
  '/vehicle': Token & z.input<typeof doorCommand>;
  '/race': Token & z.input<typeof raceCommandBody>;
}
