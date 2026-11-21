import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/server/db';

test('migrations create the schema once and survive reopening a file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'manchester-drive-'));
  try {
    const path = join(dir, 'nested', 'game.db');
    const first = openDatabase(path);
    first.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1', 'Ada', 'x', 0)",
    );
    first.close();
    const second = openDatabase(path);
    expect(second.query('PRAGMA user_version').get()).toEqual({ user_version: 1 });
    expect(second.query('SELECT username FROM users').all()).toEqual([{ username: 'Ada' }]);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('usernames are unique regardless of case and each user gets one starter car', () => {
  const db = openDatabase(':memory:');
  db.run(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1', 'Ada', 'x', 0)",
  );
  expect(() =>
    db.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u2', 'ada', 'x', 0)",
    ),
  ).toThrow();
  const car = db.prepare(
    "INSERT INTO vehicles VALUES ($id, 'u1', 'hatch', 'teal', 'silver', 'none', 'ADA', $via, 0)",
  );
  car.run({ id: 'v1', via: 'starter' });
  expect(() => car.run({ id: 'v2', via: 'starter' })).toThrow();
  car.run({ id: 'v3', via: 'purchase' });
  db.run("DELETE FROM users WHERE id = 'u1'");
  expect(db.query('SELECT COUNT(*) AS n FROM vehicles').get()).toEqual({ n: 0 });
});
