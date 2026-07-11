import { createClient } from "@libsql/client";

const DB_URL = `file:${process.env.DATABASE_PATH ?? "./src/data.db"}`;

export const db = createClient({ url: DB_URL });

async function columnExists(table: string, column: string): Promise<boolean> {
	const info = await db.execute(`PRAGMA table_info(${table})`);
	return info.rows.some((row) => (row as unknown as { name: string }).name === column);
}

// Ordered, append-only schema migrations tracked by SQLite's PRAGMA user_version.
// Each migration returns its statements; the runner appends the version bump and
// runs the batch in one transaction that flips the version last, so a failed
// migration rolls back and re-runs cleanly. Column adds are guarded because
// SQLite has no ADD COLUMN IF NOT EXISTS. Append new migrations to the end;
// never edit or reorder ones that have shipped.
const MIGRATIONS: Array<() => Promise<string[]>> = [
	// v1: operator, session, and mission tables.
	async () => [
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
	async () => {
		const statements = [
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
		];
		if (!(await columnExists("user", "email"))) {
			statements.unshift(`ALTER TABLE user ADD COLUMN email TEXT`);
		}
		return statements;
	}
];

async function migrate(): Promise<void> {
	const result = await db.execute("PRAGMA user_version");
	const current = Number((result.rows[0] as unknown as { user_version: number }).user_version ?? 0);
	for (let version = current; version < MIGRATIONS.length; version++) {
		const statements = await MIGRATIONS[version]();
		await db.batch([...statements, `PRAGMA user_version = ${version + 1}`], "write");
	}
}

await migrate();

export interface DatabaseUser {
	id: string;
	username: string;
	password_hash: string;
	email: string | null;
}
