package httpserver

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/lestrrat-go/jwx/v2/jwk"
)

type fakeJWT struct{}

func (f *fakeJWT) EnsureActiveKey(ctx context.Context) error { return nil }
func (f *fakeJWT) Sign(ctx context.Context, claims jwt.MapClaims) (string, string, error) { return "token", "kid", nil }
func (f *fakeJWT) JWKS(ctx context.Context) (jwk.Set, error) { return jwk.NewSet(), nil }

func TestJWKS(t *testing.T) {
	r := Router(Deps{JWT: &fakeJWT{}})
	req := httptest.NewRequest(http.MethodGet, "/.well-known/jwks.json", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 { t.Fatalf("expected 200, got %d", w.Code) }
}

func TestExpIn(t *testing.T) {
	now := time.Now()
	in := now.Add(10 * time.Second)
	sec := expIn(&in)
	if sec <= 0 || sec > 10 { t.Fatalf("unexpected expIn: %d", sec) }
}
