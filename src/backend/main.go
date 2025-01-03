package main

import (
	"github.com/gofiber/fiber/v2"
	"github.com/razsa/go-auth/routes"
)

func main() {
	app := fiber.New()

	// Custom CORS handler
	app.Use(func(c *fiber.Ctx) error {
		origin := c.Get("Origin")

		c.Set("Access-Control-Allow-Origin", origin)
		c.Set("Access-Control-Allow-Credentials", "true")
		c.Set("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization")
		c.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")

		// Handle preflight requests
		if c.Method() == "OPTIONS" {
			return c.SendStatus(fiber.StatusOK)
		}

		return c.Next()
	})

	routes.Setup(app)
	app.Listen(":8090")
}
