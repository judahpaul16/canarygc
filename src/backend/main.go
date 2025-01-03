package main

import (
	"embed"
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/filesystem"
	"github.com/razsa/go-auth/routes"
)

//go:embed fe/*
var fe embed.FS

func main() {

	app := fiber.New()

	// Setup routes
	routes.Setup(app)

	// Serve embedded frontend files
	app.Use("/", filesystem.New(filesystem.Config{
		Root:       http.FS(fe),
		PathPrefix: "fe",
		Browse:     true,
	}))

	app.Listen(":8000")
}
