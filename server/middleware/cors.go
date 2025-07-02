package middleware

import (
	"os"

	"github.com/gin-gonic/gin"
)

// CORSHandler handles CORS (Cross-Origin Resource Sharing)
type CORSHandler struct{}

// NewCORSHandler creates a new CORSHandler
func NewCORSHandler() *CORSHandler {
	return &CORSHandler{}
}

// RegisterMiddleware registers the CORS middleware
func (h *CORSHandler) RegisterMiddleware(router *gin.Engine) {
	// Add CORS middleware only in development mode
	// In production, the Go server serves the static files directly, so CORS is not needed
	router.Use(func(c *gin.Context) {
		// Check if we're in development mode
		// This can be determined by an environment variable or by checking if we're running in a Docker container
		isDev := os.Getenv("GO_ENV") != "production"

		if isDev {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
			c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

			if c.Request.Method == "OPTIONS" {
				c.AbortWithStatus(204)

				return
			}
		}

		c.Next()
	})
}
