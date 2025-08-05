package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
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
	if err := godotenv.Load("../.env"); err != nil {
		slog.Warn("Warning: .env file not found, using environment variables")
	}
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

// setupRouter creates and configures the Gin router with all routes and middleware
func setupRouter(cfg *config.Config, mongoDB *db.MongoDB) *gin.Engine {
	r := gin.Default()

	// Register API handlers
	registerAPIHandlers(r, mongoDB)

	// Register proxy handlers
	registerProxyHandlers(r)

	// Register middleware
	registerMiddleware(r, cfg)

	return r
}

// registerAPIHandlers registers all API handlers with the router
func registerAPIHandlers(r *gin.Engine, mongoDB *db.MongoDB) {
	healthHandler := api.NewHealthHandler(mongoDB)
	healthHandler.RegisterRoutes(r)

	profileHandler := api.NewProfileHandler(mongoDB)
	profileHandler.RegisterRoutes(r)

	userHandler := api.NewUserHandler(mongoDB)
	userHandler.RegisterRoutes(r)

	jwtConfigHandler := api.NewJWTConfigHandler(mongoDB)
	jwtConfigHandler.RegisterRoutes(r)

	authHandler := api.NewAuthHandler(mongoDB)
	authHandler.RegisterRoutes(r)

	runtimeHandler := api.NewRuntimeHandler(mongoDB)
	runtimeHandler.RegisterRoutes(r)

	// Register MFA handler
	mfaHandler, err := api.NewMFAHandler(mongoDB)
	if err != nil {
		slog.Error("Failed to create MFA handler", "error", err)
	} else {
		mfaHandler.RegisterRoutes(r)
	}
}

// registerProxyHandlers registers all proxy handlers with the router
func registerProxyHandlers(r *gin.Engine) {
	proxyHandler := proxy.NewProxyHandler()
	proxyHandler.RegisterRoutes(r)
}

// registerMiddleware registers all middleware with the router
func registerMiddleware(r *gin.Engine, cfg *config.Config) {
	// Register CORS middleware (should be registered before static file middleware)
	corsHandler := middleware.NewCORSHandler()
	corsHandler.RegisterMiddleware(r)

	// Register static file middleware
	staticHandler := middleware.NewStaticHandler(cfg)
	staticHandler.RegisterMiddleware(r)
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
	r := gin.Default()

	// Register API handlers
	registerAPIHandlers(r, mongoDB)

	// Register middleware
	registerMiddleware(r, cfg)

	return r
}

// setupProxyRouter creates and configures the Gin router for proxy with proxy routes
func setupProxyRouter() *gin.Engine {
	r := gin.Default()

	// Register proxy handlers
	proxyHandler := proxy.NewProxyHandler()
	proxyHandler.RegisterRoutes(r)

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
	proxyRouter := setupProxyRouter()

	// Start the frontend server
	frontendSrv := startFrontendServer(cfg, frontendRouter)

	// Start the proxy server
	proxySrv := startProxyServer(cfg, proxyRouter)

	// Wait for shutdown signal
	waitForShutdownSignal()

	// Perform graceful shutdown for both servers
	performGracefulShutdown(rootCtx, []*Server{frontendSrv, proxySrv}, mongoDB)
}
