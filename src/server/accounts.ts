import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { character, livery, models, type Character, type Livery } from '../game/garage';
import type { OwnedVehicle } from '../protocol/commands';
import { startChoice, type StartChoice } from '../game/areas';
import type { Pose } from '../game/game-types';

export const sessionDays = 30;
const sessionMs = sessionDays * 24 * 60 * 60 * 1000;
// Names the game uses for itself, so nobody can register them.
const reservedNames = new Set(['admin', 'driver', 'guest', 'moderator', 'server', 'system']);

export const credentialsBody = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,16}$/, 'Use 3–16 letters, numbers, hyphens or underscores.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
});
export type AccountCredentials = z.output<typeof credentialsBody>;

export interface User {
  id: string;
  username: string;
  start_area: string | null;
  active_vehicle_id: string | null;
}

function hashToken(token: string) {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex');
}

export class Accounts {
  constructor(
    private readonly db: Database,
    private readonly now = Date.now,
  ) {}

  usernameTaken(name: string) {
    return !!this.db.query('SELECT 1 FROM users WHERE username = ?').get(name.trim());
  }

  async signup({ username, password }: AccountCredentials) {
    if (reservedNames.has(username.toLowerCase())) return { error: 'That name is reserved.' };
    if (this.usernameTaken(username)) return { error: 'That name is taken.' };
    const id = crypto.randomUUID();
    const hash = await Bun.password.hash(password, 'argon2id');
    try {
      this.db
        .query('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(id, username, hash, this.now());
    } catch {
      // Another signup for the same name won the race while hashing.
      return { error: 'That name is taken.' };
    }
    return { token: this.createSession(id), user: this.user(id)! };
  }

  async login({ username, password }: AccountCredentials) {
    const row = this.db
      .query('SELECT id, password_hash FROM users WHERE username = ?')
      .get(username) as { id: string; password_hash: string } | null;
    // Verify against a dummy hash for unknown names so both failures take as long.
    const ok = await Bun.password.verify(password, row?.password_hash ?? (await dummyHash));
    if (!row || !ok) return null;
    return { token: this.createSession(row.id), user: this.user(row.id)! };
  }

  logout(token: string) {
    this.db.query('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }

  userForToken(token: string | undefined): User | null {
    if (!token) return null;
    const row = this.db
      .query('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
      .get(hashToken(token)) as { user_id: string; expires_at: number } | null;
    if (!row) return null;
    if (row.expires_at <= this.now()) {
      this.logout(token);
      return null;
    }
    return this.user(row.user_id);
  }

  user(id: string): User | null {
    return this.db
      .query('SELECT id, username, start_area, active_vehicle_id FROM users WHERE id = ?')
      .get(id) as User | null;
  }

  character(userId: string): Character | null {
    const row = this.db
      .query(
        'SELECT figure, skin, hair_style AS hairStyle, hair, jacket, trousers FROM characters WHERE user_id = ?',
      )
      .get(userId) as Record<string, string> | null;
    return row && character(row);
  }

  saveCharacter(userId: string, look: Character) {
    this.db
      .query(
        `INSERT INTO characters (user_id, figure, skin, hair_style, hair, jacket, trousers, updated_at)
         VALUES ($user, $figure, $skin, $hairStyle, $hair, $jacket, $trousers, $now)
         ON CONFLICT (user_id) DO UPDATE SET figure = $figure, skin = $skin,
           hair_style = $hairStyle, hair = $hair, jacket = $jacket, trousers = $trousers,
           updated_at = $now`,
      )
      .run({ user: userId, now: this.now(), ...look });
  }

  saveStartArea(userId: string, area: StartChoice) {
    this.db.query('UPDATE users SET start_area = ? WHERE id = ?').run(startChoice(area), userId);
  }

  park(userId: string, vehicleId: string, { x, y, angle }: Pose) {
    this.db
      .query(
        `UPDATE vehicles SET parked_x = $x, parked_y = $y, parked_angle = $angle, parked_at = $now
         WHERE id = $vehicle AND user_id = $user`,
      )
      .run({ user: userId, vehicle: vehicleId, x, y, angle, now: this.now() });
  }

  vehicles(userId: string): OwnedVehicle[] {
    const rows = this.db
      .query(
        `SELECT id, model, paint, trim, stripe, plate, acquired_via AS acquiredVia,
           parked_x AS x, parked_y AS y, parked_angle AS angle, parked_at AS at
         FROM vehicles WHERE user_id = ? ORDER BY acquired_at, id`,
      )
      .all(userId) as (Record<keyof Livery, string> &
      Pick<OwnedVehicle, 'id' | 'acquiredVia'> &
      Record<'x' | 'y' | 'angle' | 'at', number | null>)[];
    return rows.map(({ id, acquiredVia, x, y, angle, at, ...rest }) => ({
      id,
      acquiredVia,
      ...livery(rest),
      parked: x === null || y === null || angle === null || at === null ? null : { x, y, angle, at },
    }));
  }

  activeVehicle(user: User) {
    return this.vehicles(user.id).find((vehicle) => vehicle.id === user.active_vehicle_id) ?? null;
  }

  useVehicle(userId: string, vehicleId: string) {
    return (
      this.db
        .query(
          `UPDATE users SET active_vehicle_id = $vehicle WHERE id = $user
           AND EXISTS (SELECT 1 FROM vehicles WHERE id = $vehicle AND user_id = $user)`,
        )
        .run({ user: userId, vehicle: vehicleId }).changes > 0
    );
  }

  // Repainting is free and leaves the model, and so the handling, unchanged.
  repaint(userId: string, vehicleId: string, { paint, trim, stripe, plate }: Livery) {
    return (
      this.db
        .query(
          `UPDATE vehicles SET paint = $paint, trim = $trim, stripe = $stripe, plate = $plate
           WHERE id = $vehicle AND user_id = $user`,
        )
        .run({ user: userId, vehicle: vehicleId, paint, trim, stripe, plate }).changes > 0
    );
  }

  // The free first vehicle. The one_starter index stops a repeated request making a second.
  claimStarter(userId: string, choice: Livery): OwnedVehicle | { error: string } {
    if (!models[choice.model].starter) return { error: 'That vehicle is not a starter.' };
    const id = crypto.randomUUID();
    try {
      this.db.transaction(() => {
        this.db
          .query(
            `INSERT INTO vehicles (id, user_id, model, paint, trim, stripe, plate, acquired_via, acquired_at)
             VALUES ($id, $user, $model, $paint, $trim, $stripe, $plate, 'starter', $now)`,
          )
          .run({ id, user: userId, now: this.now(), ...choice });
        this.db.query('UPDATE users SET active_vehicle_id = ? WHERE id = ?').run(id, userId);
      })();
    } catch {
      return { error: 'You already have your first vehicle.' };
    }
    return { id, acquiredVia: 'starter', ...choice, parked: null };
  }

  private createSession(userId: string) {
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    const now = this.now();
    this.db.query('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?').run(userId, now);
    this.db
      .query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), userId, now + sessionMs);
    return token;
  }
}

const dummyHash = Bun.password.hash(crypto.randomUUID(), 'argon2id');

// Counts failed logins in memory. One process serves the whole game.
export class LoginLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly limits = { ip: 20, username: 5, windowMs: 15 * 60 * 1000 },
    private readonly now = Date.now,
  ) {}

  blocked(ip: string, username: string) {
    return (
      this.recent('ip:' + ip).length >= this.limits.ip ||
      this.recent('user:' + username.toLowerCase()).length >= this.limits.username
    );
  }

  fail(ip: string, username: string) {
    // Drop stale keys now and then so a spray of usernames cannot grow the map forever.
    if (this.failures.size > 10_000) for (const key of [...this.failures.keys()]) this.recent(key);
    for (const key of ['ip:' + ip, 'user:' + username.toLowerCase()])
      this.failures.set(key, [...this.recent(key), this.now()]);
  }

  private recent(key: string) {
    const since = this.now() - this.limits.windowMs;
    const times = (this.failures.get(key) ?? []).filter((time) => time > since);
    if (times.length) this.failures.set(key, times);
    else this.failures.delete(key);
    return times;
  }
}
