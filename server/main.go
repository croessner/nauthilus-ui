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

// registerAPIHandlers registers all API handlers with the router
func registerAPIHandlers(r *gin.Engine, mongoDB *db.MongoDB) {
	// Create a custom middleware that strictly enforces JWT authentication
	strictJWTMiddleware := func(ctx *gin.Context) {
		// Skip authentication for auth and health endpoints
		path := ctx.Request.URL.Path
		if strings.HasPrefix(path, "/api/auth/") || strings.HasPrefix(path, "/api/health") {
			ctx.Next()

			return
		}

		// For all other API endpoints, require JWT authentication
		authHeader := ctx.GetHeader("Authorization")
		if authHeader == "" {
			slog.Warn("Missing Authorization header for protected endpoint", "path", path)
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header is required"})
			ctx.Abort()

			return
		}

		// Continue with the standard JWT middleware
		middleware.JWTAuthMiddleware(mongoDB)(ctx)
	}

	// Apply the strict JWT middleware to all API routes
	apiGroup := r.Group("/api")
	apiGroup.Use(strictJWTMiddleware)

	// Register auth endpoints (middleware will skip these)
	authHandler := api.NewAuthHandler(mongoDB)
	authHandler.RegisterRoutes(r)

	// Register OIDC endpoints (optional; middleware will skip these)
	oidcHandler := api.NewOIDCHandler(mongoDB)
	oidcHandler.RegisterRoutes(r)

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

	// Register proxy handlers
	proxyHandler := proxy.NewProxyHandler()
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

	// Create root context
	rootCtx := context.Background()

	// Setup MongoDB
	mongoDB := setupMongoDB(rootCtx, cfg)

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
