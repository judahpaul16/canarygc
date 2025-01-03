package main

import (
	"github.com/gofiber/fiber/v2"
	"github.com/razsa/go-auth/routes"
)

func main() {

	app := fiber.New()

	// Setup routes
	routes.Setup(app)

	app.Listen(":8000")
}
