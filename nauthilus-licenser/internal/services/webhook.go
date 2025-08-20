package services

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"nauthilus-licenser/internal/mollie"
	"nauthilus-licenser/internal/models"
	"nauthilus-licenser/internal/repo"
)

type MollieClient interface {
	GetPayment(ctx context.Context, id string) (*mollie.Payment, error)
	GetSubscription(ctx context.Context, customerID, subID string) (*mollie.Subscription, error)
}

type WebhookService struct {
	mollie   MollieClient
	lic      *LicenseService
	subs     repo.SubscriptionRepository
	events   repo.WebhookEventRepository
}

func NewWebhookService(m MollieClient, lic *LicenseService, subs repo.SubscriptionRepository, events repo.WebhookEventRepository) *WebhookService {
	return &WebhookService{mollie: m, lic: lic, subs: subs, events: events}
}

// Handle processes a Mollie webhook with resource id from form or JSON
func (s *WebhookService) Handle(ctx context.Context, id string) error {
	if id == "" { return errors.New("missing id") }
	processed, err := s.events.AlreadyProcessed(ctx, id)
	if err != nil { return err }
	if processed { return nil }

	if strings.HasPrefix(id, "tr_") { // payment
		p, err := s.mollie.GetPayment(ctx, id)
		if err != nil { return err }
		if p.Status == "paid" || p.Status == "authorized" {
			// derive metadata: userId, plan, entitlements
			var meta map[string]any
			_ = json.Unmarshal(p.Metadata, &meta)
			userID, _ := meta["userId"].(string)
			plan, _ := meta["planId"].(string)
			ent := map[string]bool{"download": true, "runtime": true}
			// In real impl, map plan->entitlements
			periodEnd := time.Now().Add(30 * 24 * time.Hour)
			if err := s.lic.UpdateFromPaid(ctx, userID, plan, ent, periodEnd, "subscription"); err != nil { return err }
		}
	} else if strings.HasPrefix(id, "sub_") { // direct subscription event
		// need customerId from stored subscription; try lookup
		sub, err := s.subs.GetByMollieID(ctx, id)
		if err != nil { return err }
		// if we had customerId, could validate via Mollie; skip for MVP
		_ = sub
	}
	// mark processed
	return s.events.MarkProcessed(ctx, &models.WebhookEvent{ID: id, ResourceID: id, Type: "mollie", ProcessedAt: time.Now(), Result: "ok"})
}
