package services

import (
	"context"
	"testing"
)

func TestWebhookRejectsMissingID(t *testing.T) {
	ws := NewWebhookService(nil, nil, nil, nil)
	if err := ws.Handle(context.Background(), ""); err == nil {
		t.Fatal("expected error for missing id")
	}
}
