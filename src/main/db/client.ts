import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type AppDatabase = BetterSQLite3Database<typeof schema>

/** Mở SQLite (file hoặc ':memory:'), bật WAL + khóa ngoại, chạy migration. */
export function openDatabase(filename: string, migrationsFolder: string): { db: AppDatabase; close(): void } {
  const sqlite = new Database(filename)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return { db, close: () => sqlite.close() }
}
