import type { Database } from 'bun:sqlite';
import { z } from 'zod';

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
