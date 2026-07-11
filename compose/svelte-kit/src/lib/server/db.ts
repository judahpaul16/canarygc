import { createClient } from "@libsql/client";

const DB_URL = `file:${process.env.DATABASE_PATH ?? "./src/data.db"}`;

export const db = createClient({ url: DB_URL });

// Ordered, append-only schema migrations tracked by SQLite's PRAGMA user_version.
// Each entry advances the version by one; the runner applies every entry above
// the current version inside one transaction that flips the version last, so a
// failed migration rolls back and re-runs cleanly. Append new migrations to the
// end; never edit or reorder ones that have shipped.
const MIGRATIONS: string[][] = [
	// v1: operator, session, and mission tables.
	[
		`CREATE TABLE IF NOT EXISTS user (
    id TEXT NOT NULL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
)`,
		`CREATE TABLE IF NOT EXISTS session (
    id TEXT NOT NULL PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id)
)`,
		`CREATE TABLE IF NOT EXISTS mission (
    id TEXT NOT NULL PRIMARY KEY,
    title TEXT NOT NULL,
    actions JSON NOT NULL,
    isLoaded BOOLEAN NOT NULL
)`
	],
	// v2: operator email, password-reset tokens, and integration/alert settings.
	[
		`ALTER TABLE user ADD COLUMN email TEXT`,
		`CREATE TABLE IF NOT EXISTS password_reset (
    token_hash TEXT NOT NULL PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id)
)`,
		`CREATE TABLE IF NOT EXISTS app_setting (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
)`
	]
];

async function migrate(): Promise<void> {
	const result = await db.execute("PRAGMA user_version");
	const current = Number((result.rows[0] as unknown as { user_version: number }).user_version ?? 0);
	for (let version = current; version < MIGRATIONS.length; version++) {
		await db.batch([...MIGRATIONS[version], `PRAGMA user_version = ${version + 1}`], "write");
	}
}

await migrate();

export interface DatabaseUser {
	id: string;
	username: string;
	password_hash: string;
	email: string | null;
}
