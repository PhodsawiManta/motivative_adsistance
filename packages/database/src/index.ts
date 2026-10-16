import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';
import { settingsSchema, type Settings } from '../../shared/src/schema';

export function openDatabase(path: string = './data/motivative.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('secure_delete = ON');
  sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
  for (const name of readdirSync(resolve('packages/database/migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    if (!sqlite.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(name))
      sqlite.transaction(() => {
        sqlite.exec(readFileSync(resolve('packages/database/migrations', name), 'utf8'));
        sqlite.prepare('INSERT INTO schema_migrations VALUES (?)').run(name);
      })();
  }
  const db = drizzle(sqlite, { schema });
  let user = db.select().from(schema.users).get();
  if (!user) {
    user = { id: crypto.randomUUID(), name: 'Local user' };
    db.insert(schema.users).values(user).run();
  }
  const userId = user.id;
  function settings(): Settings {
    return settingsSchema.parse(
      Object.fromEntries(
        db
          .select()
          .from(schema.preferences)
          .all()
          .map((r) => [r.key, JSON.parse(r.value)]),
      ),
    );
  }
  function setSettings(value: Partial<Settings>) {
    const parsed = settingsSchema.parse({ ...settings(), ...value });
    if (parsed.weakThreshold > parsed.strongThreshold)
      throw new Error('Weak threshold must not exceed strong threshold');
    db.transaction((tx) => {
      for (const [key, v] of Object.entries(parsed))
        tx.insert(schema.preferences)
          .values({ userId, key, value: JSON.stringify(v) })
          .onConflictDoUpdate({ target: schema.preferences.key, set: { value: JSON.stringify(v) } })
          .run();
    });
    return parsed;
  }
  return { db, sqlite, settings, setSettings, close: () => sqlite.close() };
}
export type Store = ReturnType<typeof openDatabase>;
