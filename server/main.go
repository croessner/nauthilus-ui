package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"nauthilus-ui/server/api"
	"nauthilus-ui/server/audit"
	"nauthilus-ui/server/config"
	"nauthilus-ui/server/db"
	"nauthilus-ui/server/middleware"
	"nauthilus-ui/server/proxy"
)

// version will be set during build using ldflags
var version = "dev"

// Constants for timeouts
const (
	mongoConnectionTimeout = 60 * time.Second
	serverShutdownTimeout  = 5 * time.Second
)

// setupLogger initializes and configures the logger
func setupLogger() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		AddSource: true,
		Level:     slog.LevelInfo,
	}))

	slog.SetDefault(logger)
}

// loadEnvironment loads environment variables from .env file
func loadEnvironment() {
	// Try to load from .env file in the current directory (for Docker)
	if err := godotenv.Load(".env"); err != nil {
		// Try to load from .env file in the parent directory (for development)
		if err := godotenv.Load("../.env"); err != nil {
			slog.Warn("Warning: .env file not found, using environment variables")
		}
	}

	// Log the environment variables for debugging
	slog.Info("Environment variables loaded",
		"REACT_APP_PROXY_PORT", os.Getenv("REACT_APP_PROXY_PORT"),
		"PROXY_PORT", os.Getenv("PROXY_PORT"))
}

// setupMongoDB initializes and connects to MongoDB
func setupMongoDB(rootCtx context.Context, cfg *config.Config) *db.MongoDB {
	mongoDB := db.NewMongoDB(cfg)

	ctx, cancel := context.WithTimeout(rootCtx, mongoConnectionTimeout)

	// Add context cancel function to mongoDB
	mongoDB.SetCancelFunc(cancel)

	// Initial connection attempt
	go mongoDB.RetryConnection(ctx, true)

	return mongoDB
}

// startAuditCleanupScheduler starts a background task that periodically deletes
// audit log entries older than the configured retention period.
func startAuditCleanupScheduler(cfg *config.Config, mongoDB *db.MongoDB) {
	if cfg.AuditRetentionDays <= 0 {
		slog.Info("Audit cleanup scheduler disabled (AUDIT_RETENTION_DAYS <= 0)", "AUDIT_RETENTION_DAYS", cfg.AuditRetentionDays)

		return
	}

	interval := time.Duration(cfg.AuditCleanupIntervalHours) * time.Hour
	if interval <= 0 {
		interval = 6 * time.Hour
	}

	slog.Info("Starting audit cleanup scheduler", "retentionDays", cfg.AuditRetentionDays, "interval", interval.String())

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		run := func() {
			if !mongoDB.IsConnectedToMongoDB() {
				slog.Debug("Skipping audit cleanup; database not connected")
				return
			}

			cutoff := time.Now().Add(-time.Duration(cfg.AuditRetentionDays) * 24 * time.Hour)

			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()

			deleted, err := mongoDB.DeleteOldAuditLogs(ctx, cutoff)
			if err != nil {
				slog.Error("Audit cleanup failed", "error", err)

				return
			}

			if deleted > 0 {
				slog.Info("Audit cleanup completed", "deleted", deleted, "olderThan", cutoff.Format(time.RFC3339))
			} else {
				slog.Debug("Audit cleanup completed; no entries to delete", "olderThan", cutoff.Format(time.RFC3339))
			}
		}

		// Run once shortly after startup
		time.AfterFunc(5*time.Second, run)

		for range ticker.C {
			run()
		}
	}()
}

// registerAPIHandlers registers all API handlers with the router
func registerAPIHandlers(r *gin.Engine, mongoDB *db.MongoDB) {
	// Create a custom middleware that strictly enforces JWT authentication
	strictJWTMiddleware := func(ctx *gin.Context) {
		// Skip authentication for auth and health endpoints
		path := ctx.Request.URL.Path
		if strings.HasPrefix(path, "/api/auth/") || strings.HasPrefix(path, "/api/health") || strings.HasPrefix(path, "/api/i18n/") {
			ctx.Next()

			return
		}

		// Delegate auth to the standard JWT middleware (supports header or cookie)
		middleware.JWTAuthMiddleware(mongoDB)(ctx)
	}

	// Apply the strict JWT middleware globally (it inspects path to skip public endpoints)
	r.Use(strictJWTMiddleware)
	apiGroup := r.Group("/api")

	// Register auth endpoints (middleware will skip these)
	authHandler := api.NewAuthHandler(mongoDB)
	authHandler.RegisterRoutes(r)

	// Register OIDC endpoints (optional; middleware will skip these)
	oidcHandler := api.NewOIDCHandler(mongoDB)
	oidcHandler.RegisterRoutes(r)

	// Register public i18n endpoints (must be accessible before login)
	i18nHandler := api.NewI18nHandler()
	i18nHandler.RegisterRoutes(r)

	// Register health endpoint (middleware will skip these)
	healthHandler := api.NewHealthHandler(mongoDB)
	healthHandler.RegisterRoutes(r)

	// Register user routes (will be protected by middleware)
	userHandler := api.NewUserHandler(mongoDB)
	// Register user routes directly since UserHandler.RegisterRoutes is deprecated
	apiGroup.GET("/users", userHandler.GetUsers)
	apiGroup.GET("/users/:username", userHandler.GetUser)
	apiGroup.POST("/users", userHandler.CreateUser)
	apiGroup.PUT("/users/:username", userHandler.UpdateUser)
	apiGroup.DELETE("/users/:username", userHandler.DeleteUser)

	// Register profile routes (will be protected by middleware)
	profileHandler := api.NewProfileHandler(mongoDB)
	profileHandler.RegisterRoutes(r)

	// Register JWT config routes (will be protected by middleware)
	jwtConfigHandler := api.NewJWTConfigHandler(mongoDB)
	jwtConfigHandler.RegisterRoutes(r)

	// Register runtime routes (will be protected by middleware)
	runtimeHandler := api.NewRuntimeHandler(mongoDB)
	runtimeHandler.RegisterRoutes(r)

	// Register MFA handler (will be protected by middleware)
	mfaHandler, err := api.NewMFAHandler(mongoDB)
	if err != nil {
		slog.Error("Failed to create MFA handler", "error", err)
	} else {
		mfaHandler.RegisterRoutes(r)
	}

	// Register Legal handler (protected by middleware via apiGroup)
	legalHandler := api.NewLegalHandler(mongoDB)
	legalHandler.RegisterGroupRoutes(apiGroup)

	// Register Audit handler (admin-only, protected by middleware via apiGroup)
	auditHandler := api.NewAuditHandler(mongoDB)
	auditHandler.RegisterGroupRoutes(apiGroup)

	// Register Report handler (protected by middleware)
	reportHandler := api.NewReportHandler(mongoDB)
	reportHandler.RegisterRoutes(r)
}

// registerMiddleware registers all middleware with the router
func registerMiddleware(r *gin.Engine, cfg *config.Config, _ *db.MongoDB) {
	// Register CORS middleware first (should be registered before other middleware)
	corsHandler := middleware.NewCORSHandler()
	corsHandler.RegisterMiddleware(r)

	// Register static file middleware
	staticHandler := middleware.NewStaticHandler(cfg)
	staticHandler.RegisterMiddleware(r)

	// We'll register protected routes directly with middleware instead of using a global middleware
}

// Server represents an HTTP server
type Server struct {
	*http.Server
	Name string
}

// startFrontendServer starts the frontend HTTP server and returns it
func startFrontendServer(cfg *config.Config, router *gin.Engine) *Server {
	srv := &Server{
		Server: &http.Server{
			Addr:    cfg.FrontendAddress + ":" + cfg.FrontendPort,
			Handler: router,
		},
		Name: "Frontend",
	}

	// Start the server in a goroutine
	go func() {
		slog.Info("Frontend server running", "address", cfg.FrontendAddress, "port", cfg.FrontendPort, "version", version)

		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("Failed to start frontend server", "error", err)

			os.Exit(1)
		}
	}()

	return srv
}

// startProxyServer starts the proxy HTTP server and returns it
func startProxyServer(cfg *config.Config, proxyRouter *gin.Engine) *Server {
	srv := &Server{
		Server: &http.Server{
			Addr:    cfg.ProxyAddress + ":" + cfg.ProxyPort,
			Handler: proxyRouter,
		},
		Name: "Proxy",
	}

	// Start the server in a goroutine
	go func() {
		slog.Info("Proxy server running", "address", cfg.ProxyAddress, "port", cfg.ProxyPort, "version", version)

		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("Failed to start proxy server", "error", err)

			os.Exit(1)
		}
	}()

	return srv
}

// waitForShutdownSignal waits for interrupt signal to gracefully shut down the server
func waitForShutdownSignal() {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	<-quit

	slog.Info("Shutting down server...")
}

// performGracefulShutdown gracefully shuts down the servers and disconnects from MongoDB
func performGracefulShutdown(rootCtx context.Context, servers []*Server, mongoDB *db.MongoDB) {
	// Create a deadline to wait for
	ctx, cancel := context.WithTimeout(rootCtx, serverShutdownTimeout)
	defer cancel()

	// Disconnect from MongoDB
	if err := mongoDB.Disconnect(ctx); err != nil {
		slog.Error("Error disconnecting from MongoDB", "error", err)
	}

	// Shut down all servers
	for _, srv := range servers {
		slog.Info("Shutting down server", "name", srv.Name)
		if err := srv.Shutdown(ctx); err != nil {
			slog.Error("Server forced to shutdown", "name", srv.Name, "error", err)
		}
	}

	slog.Info("All servers exited")
}

// setupFrontendRouter creates and configures the Gin router for frontend with API routes and middleware
func setupFrontendRouter(cfg *config.Config, mongoDB *db.MongoDB) *gin.Engine {
	r := gin.New()
	// Use recovery and our custom slog-based logger to replace Gin's default logger
	r.Use(gin.Recovery())
	r.Use(middleware.Logger())

	// Register API handlers
	registerAPIHandlers(r, mongoDB)

	// Register middleware
	registerMiddleware(r, cfg, mongoDB)

	return r
}

// setupProxyRouter creates and configures the Gin router for proxy with proxy routes
func setupProxyRouter(cfg *config.Config, mongoDB *db.MongoDB) *gin.Engine {
	r := gin.New()
	// Use recovery and our custom slog-based logger to replace Gin's default logger
	r.Use(gin.Recovery())
	r.Use(middleware.Logger())

	// Strict JWT middleware for proxy routes (with CORS headers applied early)
	strictProxyJWTMiddleware := func(ctx *gin.Context) {
		// Always set CORS headers so that even 401/403 responses are visible to browsers
		origin := ctx.Request.Header.Get("Origin")
		if origin == "" {
			// Default to localhost:3000 for development
			origin = "http://localhost:3000"
		}

		ctx.Header("Access-Control-Allow-Origin", origin)
		ctx.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD")
		allowReq := ctx.GetHeader("Access-Control-Request-Headers")
		baseAllow := "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, x-target-url, x-endpoint-path, x-operation, x-action, x-auth-type, x-auth-value, If-None-Match, If-Match, If-Modified-Since, If-Unmodified-Since, Range"
		if allowReq != "" {
			ctx.Header("Access-Control-Allow-Headers", baseAllow+", "+allowReq)
		} else {
			ctx.Header("Access-Control-Allow-Headers", baseAllow)
		}
		ctx.Header("Access-Control-Allow-Credentials", "true")
		ctx.Header("Access-Control-Expose-Headers", "Content-Length, Content-Range, ETag, Last-Modified, Accept-Ranges, Location")
		ctx.Header("Access-Control-Max-Age", "86400") // 24 hours

		method := ctx.Request.Method
		if method == http.MethodOptions {
			// Preflight handled here
			ctx.AbortWithStatus(204)
			return
		}

		path := ctx.Request.URL.Path

		// Skip authentication for specific public proxy endpoints
		if strings.HasPrefix(path, "/proxy/oidc-token") {
			ctx.Next()

			return
		}

		// Delegate JWT validation to the standard middleware (supports cookies or Authorization header)
		middleware.JWTAuthMiddleware(mongoDB)(ctx)
	}

	// Apply strict proxy middleware
	r.Use(strictProxyJWTMiddleware)

	// Register proxy handlers
	proxyHandler := proxy.NewProxyHandler(mongoDB)
	proxyHandler.RegisterRoutes(r)

	// Register middleware
	registerMiddleware(r, cfg, mongoDB)

	return r
}

func main() {
	// Setup logger
	setupLogger()

	// Load environment variables
	loadEnvironment()

	// Load configuration
	cfg := config.LoadConfig()

	// Initialize audit policy
	audit.Init(cfg)

	// Create root context
	rootCtx := context.Background()

	// Setup MongoDB
	mongoDB := setupMongoDB(rootCtx, cfg)

	// Start audit cleanup scheduler (if enabled)
	startAuditCleanupScheduler(cfg, mongoDB)

	// Setup frontend router with API routes and middleware
	frontendRouter := setupFrontendRouter(cfg, mongoDB)

	// Setup proxy router with proxy routes
	proxyRouter := setupProxyRouter(cfg, mongoDB)

	// Start the frontend server
	frontendSrv := startFrontendServer(cfg, frontendRouter)

	// Start the proxy server
	proxySrv := startProxyServer(cfg, proxyRouter)

	// Wait for shutdown signal
	waitForShutdownSignal()

	// Perform graceful shutdown for both servers
	performGracefulShutdown(rootCtx, []*Server{frontendSrv, proxySrv}, mongoDB)
}
