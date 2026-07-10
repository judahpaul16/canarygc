import { createClient } from "@libsql/client";

const DB_URL = `file:${process.env.DATABASE_PATH ?? "./src/data.db"}`;

export const db = createClient({ url: DB_URL });

await db.batch(
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
	"write"
);

export interface DatabaseUser {
	id: string;
	username: string;
	password_hash: string;
}
