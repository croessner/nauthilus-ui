package middleware

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

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
	// Note: OIDC client secrets are NOT exposed to the frontend for security reasons.
	envConfig := map[string]string{
		"REACT_APP_TOKEN_EXPIRY":              fmt.Sprintf("%d", h.Config.Session.TokenExpirySeconds),
		"REACT_APP_REFRESH_TOKEN_EXPIRY":      fmt.Sprintf("%d", h.Config.Session.RefreshTokenExpirySeconds),
		"REACT_APP_REMEMBER_ME_EXPIRY":        fmt.Sprintf("%d", h.Config.Session.RememberMeExpirySeconds),
		"REACT_APP_COOKIE_BANNER_RESHOW_DAYS": fmt.Sprintf("%d", h.Config.UI.CookieBannerReshowDays),
		"REACT_APP_PROXY_PORT":                fmt.Sprintf("%d", h.Config.Server.Proxy.PublicPort),
		"REACT_APP_RAW_JSON_MAX_BYTES":        fmt.Sprintf("%d", h.Config.UI.RawJSONMaxBytes),
		// Whitelisted OIDC-related variables needed in the frontend
		"REACT_APP_OIDC_ENABLED":        fmt.Sprintf("%t", h.Config.Identity.OIDC.Enabled),
		"REACT_APP_OIDC_ISSUER":         h.Config.Identity.OIDC.Issuer,
		"REACT_APP_OIDC_CLIENT_ID":      h.Config.Identity.OIDC.ClientID,
		"REACT_APP_OIDC_SCOPES":         h.Config.Identity.OIDC.Scopes,
		"REACT_APP_OIDC_ROLE_CLAIM":     h.Config.Identity.OIDC.RoleClaim,
		"REACT_APP_OIDC_USERNAME_CLAIM": h.Config.Identity.OIDC.UsernameClaim,
	}

	// Convert to JSON
	envConfigJSON, err := json.Marshal(envConfig)
	if err != nil {
		ctx.String(http.StatusInternalServerError, "Error generating environment configuration")

		return
	}

	// Serve as JavaScript that sets window._env_
	ctx.Header("Content-Type", "application/javascript")
	ctx.Header("Cache-Control", "no-store")
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

	indexHTML := string(indexData)
	modifiedHTML := ensureEnvConfigScript(indexHTML)

	ctx.Header("Content-Type", "text/html")
	ctx.String(http.StatusOK, modifiedHTML)
}

func ensureEnvConfigScript(html string) string {
	if strings.Contains(html, `src="/env-config-loader.js"`) || strings.Contains(html, "src='/env-config-loader.js'") ||
		strings.Contains(html, `src="/env-config.js"`) || strings.Contains(html, "src='/env-config.js'") {
		return html
	}

	return injectBeforeClosingHead(html, `<script src="/env-config-loader.js"></script>`)
}

// injectBeforeClosingHead injects markup before the closing head tag.
func injectBeforeClosingHead(html, markup string) string {
	// Find the last occurrence of the target string safely
	idx := strings.LastIndex(html, "</head>")
	if idx == -1 {
		return html
	}

	return html[:idx] + markup + html[idx:]
}
