package repo

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/mongo"

	"nauthilus-licenser/internal/models"
)

type KeyStore interface {
	GetActive(ctx context.Context) (*models.KeyPair, error)
	GetAllActive(ctx context.Context) ([]models.KeyPair, error)
	Save(ctx context.Context, k models.KeyPair) error
	Rotate(ctx context.Context, newKey models.KeyPair) error
}

type UserRepository interface {
	GetByID(ctx context.Context, id string) (*models.User, error)
	Upsert(ctx context.Context, u *models.User) error
}

type SubscriptionRepository interface {
	GetByMollieID(ctx context.Context, mollieSubID string) (*models.Subscription, error)
	Upsert(ctx context.Context, s *models.Subscription) error
}

type LicenseRepository interface {
	GetByUser(ctx context.Context, userID string) (*models.License, error)
	Upsert(ctx context.Context, l *models.License) error
}

type RefreshTokenRepository interface {
	Create(ctx context.Context, t *models.RefreshToken) error
	GetByID(ctx context.Context, id string) (*models.RefreshToken, error)
	Delete(ctx context.Context, id string) error
	DeleteExpired(ctx context.Context, now time.Time) (int64, error)
}

type TokenBlacklistRepository interface {
	IsBlacklisted(ctx context.Context, jti string) (bool, error)
	Add(ctx context.Context, tb *models.TokenBlacklist) error
}

type WebhookEventRepository interface {
	AlreadyProcessed(ctx context.Context, id string) (bool, error)
	MarkProcessed(ctx context.Context, ev *models.WebhookEvent) error
}

type MongoDeps struct {
	DB *mongo.Database
}
