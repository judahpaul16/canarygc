e the official Golang image as the base image
FROM golang:1.23.4-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy the Go module files
COPY go.mod go.sum ./

# Download and install the dependencies
RUN go mod download

# Copy the rest of the application source code
COPY . .

# Build the application
RUN go build -o my-go-auth .

# Use a smaller base image for the final stage
FROM alpine:latest

# Set the working directory
WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/my-go-auth .

# Copy the frontend files
COPY fe ./fe

# Expose the port the application will run on
EXPOSE 8000

# Command to run the application
CMD ["./my-go-auth"]
