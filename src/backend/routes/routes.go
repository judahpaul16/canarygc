package routes

import (
	"github.com/razsa/go-auth/controllers"
	"github.com/gofiber/fiber/v2"
)

func Setup(app *fiber.App) {

	app.Post("/api/register", controllers.Register)
	app.Post("/api/login", controllers.Login)
	app.Get("/api/user", controllers.User)
	app.Post("/api/logout", controllers.Logout)
	app.Get("/map", func(c *fiber.Ctx) error {
		return c.SendFile("fe/map.html")
	})
}
