package services

import (
	"context"
	"time"

	"nauthilus-licenser/internal/models"
	"nauthilus-licenser/internal/repo"
)

type LicenseService struct {
	users repo.UserRepository
	subs  repo.SubscriptionRepository
	lics  repo.LicenseRepository
}

func NewLicenseService(users repo.UserRepository, subs repo.SubscriptionRepository, lics repo.LicenseRepository) *LicenseService {
	return &LicenseService{users: users, subs: subs, lics: lics}
}

// GetEntitlements returns current entitlements inferred for a user
func (s *LicenseService) GetEntitlements(ctx context.Context, userID string) (download, runtime bool, plan string, subID string, validUntil time.Time, err error) {
	l, err := s.lics.GetByUser(ctx, userID)
	if err != nil { return false, false, "", "", time.Time{}, err }
	return l.Download, l.Runtime, "", "", l.ValidUntil, nil
}

// UpdateFromPaid sets licenses on payment success or active subscription
func (s *LicenseService) UpdateFromPaid(ctx context.Context, userID string, plan string, ent map[string]bool, periodEnd time.Time, source string) error {
	l := &models.License{
		UserID:       userID,
		Download:     ent["download"],
		Runtime:      ent["runtime"],
		ValidUntil:   periodEnd,
		LastIssuedAt: time.Now(),
		Source:       source,
	}
	return s.lics.Upsert(ctx, l)
}
