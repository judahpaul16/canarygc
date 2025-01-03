-- name: CreateUser :exec
INSERT INTO users (name, email, password)
VALUES (?, ?, ?);

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE email = ?;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = ?;
