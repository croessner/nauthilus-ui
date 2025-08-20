package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"nauthilus-licenser/internal/models"
	"nauthilus-licenser/internal/repo"
)

type AuthConfig struct {
	AccessTTL  time.Duration
	RefreshTTL time.Duration
}

type JWTSigner interface {
	Sign(ctx context.Context, claims jwt.MapClaims) (string, string, error)
}

type LicenseReader interface {
	GetEntitlements(ctx context.Context, userID string) (download, runtime bool, plan string, subID string, validUntil time.Time, err error)
}

type AuthService struct {
	jwt       JWTSigner
	refresh   repo.RefreshTokenRepository
	blacklist repo.TokenBlacklistRepository
	lic       LicenseReader
	cfg       AuthConfig
}

func NewAuthService(jwt JWTSigner, refresh repo.RefreshTokenRepository, blacklist repo.TokenBlacklistRepository, lic LicenseReader, cfg AuthConfig) *AuthService {
	return &AuthService{jwt: jwt, refresh: refresh, blacklist: blacklist, lic: lic, cfg: cfg}
}

func (s *AuthService) IssueAccessToken(ctx context.Context, userID string, permanent bool, isAdmin bool) (token string, jti string, exp *time.Time, err error) {
	claims := jwt.MapClaims{
		"sub": userID,
		"iat": time.Now().Unix(),
		"nbf": time.Now().Unix(),
		"jti": randomID("jti"),
	}
	if permanent {
		claims["perm"] = true
		if isAdmin { claims["role"] = "admin" }
	} else {
		exp := time.Now().Add(s.cfg.AccessTTL)
		claims["exp"] = exp.Unix()
		// derive entitlements
		download, runtime, plan, subID, _, err := s.lic.GetEntitlements(ctx, userID)
		if err != nil { return "", "", nil, err }
		claims["lic"] = map[string]bool{"download": download, "runtime": runtime}
		if download || runtime {
			claims["scope"] = buildScope(download, runtime)
		}
		if plan != "" { claims["plan"] = plan }
		if subID != "" { claims["subscriptionId"] = subID }
	}
	tok, _, err := s.jwt.Sign(ctx, claims)
	if err != nil { return "", "", nil, err }
	var expPtr *time.Time
	if v, ok := claims["exp"].(int64); ok {
		t := time.Unix(v, 0)
		expPtr = &t
	}
	return tok, claims["jti"].(string), expPtr, nil
}

func (s *AuthService) NewRefreshToken(ctx context.Context, userID string) (*models.RefreshToken, string, error) {
	id := randomID("rft")
	hash, clear := hashToken(randomID("clear"))
	t := &models.RefreshToken{
		ID:        id,
		UserID:    userID,
		Hash:      hash,
		ExpiresAt: time.Now().Add(s.cfg.RefreshTTL),
		CreatedAt: time.Now(),
	}
	if err := s.refresh.Create(ctx, t); err != nil { return nil, "", err }
	return t, id+":"+clear, nil
}

func (s *AuthService) Refresh(ctx context.Context, presented string) (string, *time.Time, error) {
	id, clear, ok := splitToken(presented)
	if !ok { return "", nil, errors.New("invalid refresh token format") }
	rec, err := s.refresh.GetByID(ctx, id)
	if err != nil { return "", nil, err }
	if time.Now().After(rec.ExpiresAt) {
		_ = s.refresh.Delete(ctx, id)
		return "", nil, errors.New("refresh expired")
	}
	if rec.Hash != hashOnly(clear) {
		return "", nil, errors.New("invalid refresh token")
	}
	// rotate: delete old, issue new
	_ = s.refresh.Delete(ctx, id)
	tok, _, exp, err := s.IssueAccessToken(ctx, rec.UserID, false, false)
	return tok, exp, err
}

func randomID(prefix string) string {
	return prefix + "-" + hex.EncodeToString([]byte(time.Now().Format("20060102150405.000000")))
}

func hashToken(clear string) (hash, raw string) {
	s := clear + "|pepper"
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:]), clear
}

func hashOnly(clear string) string {
	s := clear + "|pepper"
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func splitToken(s string) (id, clear string, ok bool) {
	for i := 0; i < len(s); i++ {
		if s[i] == ':' {
			return s[:i], s[i+1:], true
		}
	}
	return "", "", false
}

func buildScope(download, runtime bool) string {
	scope := ""
	if download { scope += "download" }
	if runtime {
		if scope != "" { scope += " " }
		scope += "runtime"
	}
	return scope
}
