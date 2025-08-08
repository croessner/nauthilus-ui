package middleware

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/config"
)

// StaticHandler handles static file serving and environment configuration
type StaticHandler struct {
	Config *config.Config
}

// NewStaticHandler creates a new StaticHandler
func NewStaticHandler(cfg *config.Config) *StaticHandler {
	return &StaticHandler{
		Config: cfg,
	}
}

// RegisterMiddleware registers the static file middleware
func (h *StaticHandler) RegisterMiddleware(router *gin.Engine) {
	// Security headers (override any upstream invalid directives)
	router.Use(func(ctx *gin.Context) {
		// Set a minimal, valid Permissions-Policy without deprecated features like 'vr'
		ctx.Header("Permissions-Policy", "geolocation=(), camera=(), microphone=(), usb=()")
		ctx.Next()
	})

	// Check if the build directory exists in the current directory (for Docker)
	if _, err := os.Stat("./build"); err == nil {
		// Serve static files from the React build in the current directory (for Docker)
		router.Use(static.Serve("/", static.LocalFile("./build", false)))
	} else {
		// Serve static files from the React build in the parent directory (for development)
		router.Use(static.Serve("/", static.LocalFile("../build", false)))
	}

	// Middleware to inject environment variables into window._env_
	router.GET("/env-config.js", h.EnvConfigHandler)

	// Handle all other requests by serving index.html with injected env-config.js script
	router.NoRoute(h.IndexHandler)
}

// EnvConfigHandler handles the /env-config.js endpoint
func (h *StaticHandler) EnvConfigHandler(ctx *gin.Context) {
	// Create a JSON object with environment variables
	// Note: JWT secret is not exposed to the frontend for security reasons
	envConfig := map[string]string{
		"REACT_APP_TOKEN_EXPIRY":         fmt.Sprintf("%d", h.Config.TokenExpiry),
		"REACT_APP_REFRESH_TOKEN_EXPIRY": fmt.Sprintf("%d", h.Config.RefreshTokenExpiry),
		"REACT_APP_REMEMBER_ME_EXPIRY":   fmt.Sprintf("%d", h.Config.RememberMeExpiry),
		"REACT_APP_PROXY_PORT":           h.Config.ReactProxyPort,
	}

	// Convert to JSON
	envConfigJSON, err := json.Marshal(envConfig)
	if err != nil {
		ctx.String(http.StatusInternalServerError, "Error generating environment configuration")

		return
	}

	// Serve as JavaScript that sets window._env_
	ctx.Header("Content-Type", "application/javascript")
	ctx.String(http.StatusOK, fmt.Sprintf("window._env_ = %s;", string(envConfigJSON)))
}

// IndexHandler handles all other requests by serving index.html with injected env-config.js script
func (h *StaticHandler) IndexHandler(ctx *gin.Context) {
	// Check if the index.html file exists in the current directory's build folder (for Docker)
	indexPath := filepath.Join(".", "build", "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		// If not, use the parent directory's build folder (for development)
		indexPath = filepath.Join("..", "build", "index.html")
	}

	// Read the HTML file
	indexData, err := os.ReadFile(indexPath)
	if err != nil {
		ctx.String(http.StatusInternalServerError, "Error loading application")

		return
	}

	// Inject the env-config.js script before the closing head tag
	indexHTML := string(indexData)
	modifiedHTML := injectScript(indexHTML, "</head>", "<script src=\"/env-config.js\"></script></head>")

	ctx.Header("Content-Type", "text/html")
	ctx.String(http.StatusOK, modifiedHTML)
}

// injectScript is a helper function to inject a script into HTML before the target string.
// It replaces the last occurrence of the target string with the replacement string.
// This is used to inject the env-config.js script before the closing head tag.
func injectScript(html, target, replacement string) string {
	// Find the last occurrence of the target string
	pos := len(html) - len(target)
	if pos < 0 {
		// Target string not found, return original HTML

		return html
	}

	// Replace the last occurrence of the target string

	return html[:pos] + replacement + html[pos+len(target):]
}
