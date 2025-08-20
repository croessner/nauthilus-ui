package jwtkeys

import (
	"context"
	"fmt"
	"testing"

	"nauthilus-licenser/internal/models"
	"nauthilus-licenser/internal/repo"
)

type memStore struct { kp *models.KeyPair; list []models.KeyPair }

var _ repo.KeyStore = (*memStore)(nil)

func (m *memStore) GetActive(ctx context.Context) (*models.KeyPair, error) { if m.kp==nil { return nil, fmt.Errorf("not found") }; return m.kp, nil }
func (m *memStore) GetAllActive(ctx context.Context) ([]models.KeyPair, error) { return m.list, nil }
func (m *memStore) Save(ctx context.Context, k models.KeyPair) error { m.kp=&k; m.list=[]models.KeyPair{k}; return nil }
func (m *memStore) Rotate(ctx context.Context, newKey models.KeyPair) error { m.kp=&newKey; m.list=[]models.KeyPair{newKey}; return nil }

func TestEnsureKeyAndJWKS(t *testing.T) {
	ms := &memStore{}
	s, err := NewJWTService(ms, "issuer")
	if err != nil { t.Fatal(err) }
	if err := s.EnsureActiveKey(context.Background()); err != nil { t.Fatal(err) }
	set, err := s.JWKS(context.Background())
	if err != nil { t.Fatal(err) }
	if set.Len() == 0 { t.Fatal("expected at least one jwk") }
}
