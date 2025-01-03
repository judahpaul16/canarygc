-- name: CreateUser :one
INSERT INTO users (name, email, password)
VALUES (?, ?, ?)
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE email = ?;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = ?;
