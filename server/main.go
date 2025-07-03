package main

import (
	"context"
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

// startServer starts the HTTP server and returns it
func startServer(cfg *config.Config, router *gin.Engine) *http.Server {
	srv := &http.Server{
		Addr:    cfg.Address + ":" + cfg.Port,
		Handler: router,
	}

	// Start the server in a goroutine
	go func() {
		slog.Info("Server running", "address", cfg.Address, "port", cfg.Port, "version", version)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Failed to start server", "error", err)

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

// performGracefulShutdown gracefully shuts down the server and disconnects from MongoDB
func performGracefulShutdown(rootCtx context.Context, srv *http.Server, mongoDB *db.MongoDB) {
	// Create a deadline to wait for
	ctx, cancel := context.WithTimeout(rootCtx, serverShutdownTimeout)
	defer cancel()

	// Disconnect from MongoDB
	if err := mongoDB.Disconnect(ctx); err != nil {
		slog.Error("Error disconnecting from MongoDB", "error", err)
	}

	// Shut down the server
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("Server forced to shutdown", "error", err)

		os.Exit(1)
	}

	slog.Info("Server exiting")
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

	// Setup router with all routes and middleware
	router := setupRouter(cfg, mongoDB)

	// Start the server
	srv := startServer(cfg, router)

	// Wait for shutdown signal
	waitForShutdownSignal()

	// Perform graceful shutdown
	performGracefulShutdown(rootCtx, srv, mongoDB)
}
