import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Each entry upgrades the schema by one version. Append new migrations; never edit old ones.
const migrations = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     username TEXT NOT NULL UNIQUE COLLATE NOCASE,
     password_hash TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     start_area TEXT,
     active_vehicle_id TEXT,
     credits INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE characters (
     user_id TEXT PRIMARY KEY REFERENCES users ON DELETE CASCADE,
     figure TEXT NOT NULL CHECK (figure IN ('feminine', 'masculine')),
     skin TEXT NOT NULL,
     hair_style TEXT NOT NULL,
     hair TEXT NOT NULL,
     jacket TEXT NOT NULL,
     trousers TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE vehicles (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
     model TEXT NOT NULL,
     paint TEXT NOT NULL,
     trim TEXT NOT NULL,
     stripe TEXT NOT NULL,
     plate TEXT NOT NULL,
     acquired_via TEXT NOT NULL CHECK (acquired_via IN ('starter', 'purchase', 'reward')),
     acquired_at INTEGER NOT NULL
   );
   CREATE INDEX vehicles_user ON vehicles(user_id);
   CREATE UNIQUE INDEX one_starter ON vehicles(user_id) WHERE acquired_via = 'starter';`,
  // Where each vehicle was last left, so its owner can carry on from there.
  `ALTER TABLE vehicles ADD COLUMN parked_x REAL;
   ALTER TABLE vehicles ADD COLUMN parked_y REAL;
   ALTER TABLE vehicles ADD COLUMN parked_angle REAL;
   ALTER TABLE vehicles ADD COLUMN parked_at INTEGER;`,
];

export const schemaVersion = migrations.length;

export function openDatabase(path = Bun.env.DATABASE_PATH ?? 'data/game.db') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { strict: true });
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db: Database) {
  const { user_version: version } = db.query('PRAGMA user_version').get() as {
    user_version: number;
  };
  if (version > migrations.length)
    throw new Error(
      'Database schema version ' + version + ' is newer than this build supports.',
    );
  for (let next = version; next < migrations.length; next++)
    db.transaction(() => {
      db.run(migrations[next]);
      db.run('PRAGMA user_version = ' + (next + 1));
    })();
}
