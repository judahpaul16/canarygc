FROM golang:1.23.4-alpine AS builder

WORKDIR /app

# Install Goose and SQLC
RUN go install github.com/pressly/goose/v3/cmd/goose@latest
RUN go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest

# Copy the go module files and download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code and other necessary directories and files into the container
COPY . .

# Build the Go app
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Start a new stage from scratch for a smaller final image
FROM alpine:latest  

# Install CA certificates
RUN apk --no-cache add ca-certificates

# Set the working directory to /app
WORKDIR /app

# Copy the pre-built binary file from the previous stage
COPY --from=builder /app/main .

# Copy the SQL schema, queries, and sqlc.yaml
COPY sql/schema ./sql/schema
COPY sql/queries ./sql/queries
COPY sqlc.yaml ./

# Copy the sqlc and goose binaries from the builder stage
COPY --from=builder /go/bin/sqlc /usr/local/bin/sqlc
COPY --from=builder /go/bin/goose /usr/local/bin/goose

# Generate SQLC code
RUN sqlc generate

# Copy the rest of the application source code
COPY . .

# Run migrations
RUN goose -dir ./sql/schema sqlite3 ./auth.db up

EXPOSE 8090

CMD ["./main"]
