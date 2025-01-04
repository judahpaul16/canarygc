import sqlite3
import os

def initialize_db():
    db_path = '/app/src/data.db'

    # Ensure the directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    try:
        # Create the database and tables
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute('''
        CREATE TABLE IF NOT EXISTS user (
            id TEXT NOT NULL PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        )''')

        cursor.execute('''
        CREATE TABLE IF NOT EXISTS session (
            id TEXT NOT NULL PRIMARY KEY,
            expires_at INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES user(id)
        )''')

        cursor.execute('''
        CREATE TABLE IF NOT EXISTS mission (
            id TEXT NOT NULL PRIMARY KEY,
            title TEXT NOT NULL,
            actions JSON NOT NULL,
            isLoaded BOOLEAN NOT NULL
        )''')

        conn.commit()
        conn.close()
        print("Database initialized successfully.")
    except sqlite3.Error as e:
        print(f"Error initializing database: {e}")
        raise

if __name__ == '__main__':
    initialize_db()
