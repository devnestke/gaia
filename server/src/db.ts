import path from 'path';

import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database } from './types/db';

// Resolve DB_FILE relative to the server package root (one level above src/)
// so the server and knex migrations always target the same file.
const dbFile = process.env.DB_FILE || 'dev.sqlite3';
const sqlite = new BetterSqlite3(path.resolve(__dirname, '..', dbFile));

const db = new Kysely<Database>({
  dialect: new SqliteDialect({ database: sqlite })
});

export default db;