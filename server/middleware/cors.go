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
	// Always add CORS middleware to handle cross-origin requests between frontend and proxy servers
	router.Use(func(c *gin.Context) {
		// Get the origin from the request
		origin := c.Request.Header.Get("Origin")

		// If origin is empty, use a default value for local development
		if origin == "" {
			// In development, allow requests from common local development origins
			if os.Getenv("GO_ENV") != "production" {
				// For all proxy endpoints, always allow frontend origins
				// This is critical for CORS preflight requests
				if c.Request.URL.Path != "" && len(c.Request.URL.Path) >= 6 && c.Request.URL.Path[:6] == "/proxy" {
					// For proxy endpoints, allow frontend origins
					c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
				} else {
					// For frontend endpoints, allow proxy origins
					c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:3002")
				}
			}
		} else {
			// Set the requesting origin as the allowed origin
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}

		// Set standard CORS headers
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, x-target-url, x-endpoint-path, x-operation, x-auth-type, x-auth-value")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		// For preflight OPTIONS requests, we need to add this header
		c.Writer.Header().Set("Access-Control-Max-Age", "86400") // 24 hours

		// Handle preflight OPTIONS requests
		if c.Request.Method == "OPTIONS" {
			// Return 204 No Content for OPTIONS requests
			c.AbortWithStatus(204)

			return
		}

		c.Next()
	})
}
