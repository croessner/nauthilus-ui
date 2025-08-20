package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"nauthilus-licenser/internal/config"
	"nauthilus-licenser/internal/httpserver"
	"nauthilus-licenser/internal/jwtkeys"
	"nauthilus-licenser/internal/mollie"
	"nauthilus-licenser/internal/mongo"
	"nauthilus-licenser/internal/repo"
	"nauthilus-licenser/internal/services"
)

func main() {
	cfg := config.Load()

	ctx := context.Background()

	mongoClient, db, err := mongo.Connect(ctx, cfg.MongoURI, cfg.MongoDBName)
	if err != nil {
		log.Fatalf("mongo connect: %v", err)
	}
	defer func() { _ = mongoClient.Disconnect(ctx) }()

	keyStore := repo.NewMongoKeyStore(db)
	jwtSvc, err := jwtkeys.NewJWTService(keyStore, cfg.Issuer)
	if err != nil {
		log.Fatalf("jwt service: %v", err)
	}

	// Ensure at least one active key exists (dev auto-generate)
	if err := jwtSvc.EnsureActiveKey(ctx); err != nil {
		log.Fatalf("ensure active key: %v", err)
	}

	userRepo := repo.NewUserRepository(db)
	subRepo := repo.NewSubscriptionRepository(db)
	licRepo := repo.NewLicenseRepository(db)
	refreshRepo := repo.NewRefreshTokenRepository(db)
	blacklistRepo := repo.NewTokenBlacklistRepository(db)
	webhookRepo := repo.NewWebhookEventRepository(db)

	mollieClient := mollie.NewClient(cfg.MollieAPIKey)

	licSvc := services.NewLicenseService(userRepo, subRepo, licRepo)
	authSvc := services.NewAuthService(jwtSvc, refreshRepo, blacklistRepo, licSvc, services.AuthConfig{
		AccessTTL: 7 * 24 * time.Hour,
		RefreshTTL: 90 * 24 * time.Hour,
	})
	webhookSvc := services.NewWebhookService(mollieClient, licSvc, subRepo, webhookRepo)

	r := httpserver.Router(httpserver.Deps{
		Cfg:           cfg,
		JWT:           jwtSvc,
		Auth:          authSvc,
		License:       licSvc,
		Webhook:       webhookSvc,
		BlacklistRepo: blacklistRepo,
	})

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("nauthilus-licenser listening on %s", cfg.Addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Println("server error:", err)
		os.Exit(1)
	}
}
