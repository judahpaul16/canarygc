-- +goose Up
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password BLOB NOT NULL
);

-- +goose Down
DROP TABLE users;
