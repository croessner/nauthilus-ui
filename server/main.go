package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/api"
	"nauthilus-ui/server/audit"
	"nauthilus-ui/server/config"
	"nauthilus-ui/server/db"
	"nauthilus-ui/server/integrations/gitops"
	"nauthilus-ui/server/integrations/sshprovider"
	"nauthilus-ui/server/middleware"
	"nauthilus-ui/server/profileversion"
	"nauthilus-ui/server/proxy"
	"nauthilus-ui/server/utils"
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
	if cfg.Audit.RetentionDays <= 0 {
		slog.Info("Audit cleanup scheduler disabled (audit.retention_days <= 0)", "audit.retention_days", cfg.Audit.RetentionDays)

		return
	}

	interval := time.Duration(cfg.Audit.CleanupIntervalHours) * time.Hour
	if interval <= 0 {
		interval = 6 * time.Hour
	}

	slog.Info("Starting audit cleanup scheduler", "retentionDays", cfg.Audit.RetentionDays, "interval", interval.String())

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		run := func() {
			if !mongoDB.IsConnectedToMongoDB() {
				slog.Debug("Skipping audit cleanup; database not connected")
				return
			}

			cutoff := time.Now().Add(-time.Duration(cfg.Audit.RetentionDays) * 24 * time.Hour)

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
func registerAPIHandlers(
	r *gin.Engine,
	cfg *config.Config,
	mongoDB *db.MongoDB,
	gitSSHProvider *sshprovider.Provider,
	runtimeSSHProvider *sshprovider.Provider,
) {
	// Create a custom middleware that strictly enforces authenticated sessions.
	strictSessionMiddleware := func(ctx *gin.Context) {
		path := ctx.Request.URL.Path
		if strings.HasPrefix(path, "/proxy/") && utils.HasLegacyAuthQueryParams(ctx.Request) {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "Backend auth must be sent via x-auth-type/x-auth-value headers"})
			ctx.Abort()
			return
		}

		if middleware.IsPublicPath(path) {
			ctx.Next()

			return
		}

		// Delegate auth to the standard cookie-based session middleware.
		middleware.SessionAuthMiddleware(mongoDB)(ctx)
	}

	// Apply the strict session middleware globally (it inspects path to skip public endpoints)
	r.Use(strictSessionMiddleware)
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
	userHandler.RegisterRoutes(r)

	// Register profile routes (will be protected by middleware)
	profileVersionService := profileversion.NewService(mongoDB, cfg.Profiles.MaxVersionsPerProfile)
	profileHandler := api.NewProfileHandler(mongoDB, profileVersionService)
	profileHandler.RegisterRoutes(r)

	// Register session config routes (will be protected by middleware)
	sessionConfigHandler := api.NewSessionConfigHandler(mongoDB)
	sessionConfigHandler.RegisterRoutes(r)

	// Register runtime routes (will be protected by middleware)
	runtimeHandler := api.NewRuntimeHandler(mongoDB, runtimeSSHProvider)
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

	// Register Git integration endpoints (protected by middleware)
	gitService := gitops.NewService(gitops.Settings{
		Enabled:                cfg.Integrations.Git.Enabled,
		DefaultBranch:          cfg.Integrations.Git.DefaultBranch,
		DefaultFilePath:        cfg.Integrations.Git.DefaultFilePath,
		OperationTimeout:       time.Duration(cfg.Integrations.Git.OperationTimeoutSeconds) * time.Second,
		MaxFileBytes:           int64(cfg.Integrations.Git.MaxFileBytes),
		PassphraseCacheSeconds: cfg.Integrations.Git.PassphraseCacheSeconds,
	}, gitSSHProvider)
	gitHandler := api.NewGitHandler(gitService, mongoDB)
	gitHandler.RegisterRoutes(r)

	// Register proxy endpoints on the same API/UI listener.
	proxyHandler := proxy.NewProxyHandler(mongoDB)
	proxyHandler.SSH = runtimeSSHProvider
	proxyHandler.RegisterRoutes(r)
}

// registerMiddleware registers all middleware with the router.
func registerMiddleware(r *gin.Engine, cfg *config.Config) {
	requestContext := middleware.NewRequestContextHandler(cfg)
	requestContext.RegisterMiddleware(r)

	securityHeaders := middleware.NewSecurityHeadersHandler()
	securityHeaders.RegisterMiddleware(r)

	// Register CORS middleware first (should be registered before other middleware)
	corsHandler := middleware.NewCORSHandler(cfg)
	corsHandler.RegisterMiddleware(r)

	// Protect cookie-authenticated mutating requests with CSRF validation.
	csrfProtection := middleware.NewCSRFProtection(cfg)
	csrfProtection.RegisterMiddleware(r)

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

// startFrontendServer starts the unified frontend/API/proxy HTTP server and returns it.
func startFrontendServer(cfg *config.Config, router *gin.Engine) *Server {
	srv := &Server{
		Server: &http.Server{
			Addr:    fmt.Sprintf("%s:%d", cfg.Server.Frontend.Address, cfg.Server.Frontend.Port),
			Handler: router,
		},
		Name: "Frontend/API",
	}

	// Start the server in a goroutine
	go func() {
		slog.Info("Frontend/API server running", "address", cfg.Server.Frontend.Address, "port", cfg.Server.Frontend.Port, "version", version)

		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("Failed to start frontend server", "error", err)

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

// setupFrontendRouter creates and configures the Gin router for frontend with API/proxy routes and middleware.
func setupFrontendRouter(
	cfg *config.Config,
	mongoDB *db.MongoDB,
	gitSSHProvider *sshprovider.Provider,
	runtimeSSHProvider *sshprovider.Provider,
) *gin.Engine {
	r := gin.New()
	if err := r.SetTrustedProxies(cfg.Server.TrustedProxies); err != nil {
		slog.Error("Failed to configure trusted proxies for frontend router; falling back to trust-none mode", "error", err)
		_ = r.SetTrustedProxies(nil)
	}
	// Use recovery and our custom slog-based logger to replace Gin's default logger
	r.Use(gin.Recovery())
	r.Use(middleware.Logger())

	// Register middleware
	registerMiddleware(r, cfg)

	// Register API handlers after global middleware so request metadata, CORS, CSRF and headers
	// are applied to every endpoint.
	registerAPIHandlers(r, cfg, mongoDB, gitSSHProvider, runtimeSSHProvider)

	return r
}

func buildSSHProviderMappings(users []config.SSHUserConfig) []sshprovider.UserMapping {
	sshMappings := make([]sshprovider.UserMapping, 0, len(users))
	for _, user := range users {
		sshMappings = append(sshMappings, sshprovider.UserMapping{
			Username:       user.Username,
			SSHUser:        user.SSHUser,
			PrivateKeyPath: user.PrivateKeyPath,
			KnownHostsPath: user.KnownHostsPath,
		})
	}

	return sshMappings
}

func main() {
	// Setup logger
	setupLogger()

	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		slog.Error("Failed to load configuration", "error", err)
		os.Exit(1)
	}

	// Initialize audit policy
	audit.Init(cfg)

	// Create root context
	rootCtx := context.Background()

	// Setup MongoDB
	mongoDB := setupMongoDB(rootCtx, cfg)

	gitSSHProvider := sshprovider.NewProvider(
		cfg.Integrations.Git.PassphraseCacheSeconds,
		buildSSHProviderMappings(cfg.Integrations.Git.SSH.Users),
	)
	runtimeSSHProvider := sshprovider.NewProvider(
		cfg.Integrations.Runtime.SSH.PassphraseCacheSeconds,
		buildSSHProviderMappings(cfg.Integrations.Runtime.SSH.Users),
	)

	// Start audit cleanup scheduler (if enabled)
	startAuditCleanupScheduler(cfg, mongoDB)

	// Setup unified router with frontend, API, and proxy routes.
	frontendRouter := setupFrontendRouter(cfg, mongoDB, gitSSHProvider, runtimeSSHProvider)

	// Start the server.
	frontendSrv := startFrontendServer(cfg, frontendRouter)

	// Wait for shutdown signal
	waitForShutdownSignal()

	// Perform graceful shutdown.
	performGracefulShutdown(rootCtx, []*Server{frontendSrv}, mongoDB)
}
