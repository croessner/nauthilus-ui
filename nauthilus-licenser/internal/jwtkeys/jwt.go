package jwtkeys

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"nauthilus-licenser/internal/models"
	"nauthilus-licenser/internal/repo"
)

type JWTService interface {
	EnsureActiveKey(ctx context.Context) error
	Sign(ctx context.Context, claims jwt.MapClaims) (string, string, error) // returns token and kid
	JWKS(ctx context.Context) (jwk.Set, error)
}

type service struct {
	store  repo.KeyStore
	issuer string
}

func NewJWTService(store repo.KeyStore, issuer string) (JWTService, error) {
	if store == nil { return nil, errors.New("nil keystore") }
	return &service{store: store, issuer: issuer}, nil
}

func (s *service) EnsureActiveKey(ctx context.Context) error {
	if _, err := s.store.GetActive(ctx); err == nil {
		return nil
	}
	kp, err := generateKeyPair()
	if err != nil { return err }
	return s.store.Save(ctx, kp)
}

func (s *service) Sign(ctx context.Context, claims jwt.MapClaims) (string, string, error) {
	kp, err := s.store.GetActive(ctx)
	if err != nil { return "", "", err }
	privKey, err := parseRSAPrivateKeyFromPEM(kp.PrivatePEM)
	if err != nil { return "", "", err }
	claims["iss"] = s.issuer
	t := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	t.Header["kid"] = kp.KID
	ss, err := t.SignedString(privKey)
	if err != nil { return "", "", err }
	return ss, kp.KID, nil
}

func (s *service) JWKS(ctx context.Context) (jwk.Set, error) {
	keys, err := s.store.GetAllActive(ctx)
	if err != nil { return nil, err }
	set := jwk.NewSet()
	for _, k := range keys {
		pubKey, err := parseRSAPublicKeyFromPEM(k.PublicPEM)
		if err != nil { return nil, err }
		j, err := jwk.FromRaw(pubKey)
		if err != nil { return nil, err }
		_ = j.Set(jwk.KeyIDKey, k.KID)
		_ = j.Set(jwk.AlgorithmKey, "RS256")
		set.AddKey(j)
	}
	return set, nil
}

func generateKeyPair() (models.KeyPair, error) {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil { return models.KeyPair{}, err }
	privBytes := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(priv)})
	pubASN1, err := x509.MarshalPKIXPublicKey(&priv.PublicKey)
	if err != nil { return models.KeyPair{}, err }
	pubBytes := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: pubASN1})
	kid := time.Now().Format("2006-01") + "-k1"
	return models.KeyPair{
		KID:        kid,
		PublicPEM:  pubBytes,
		PrivatePEM: privBytes,
		Active:     true,
		CreatedAt:  time.Now(),
	}, nil
}

func parseRSAPrivateKeyFromPEM(b []byte) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(b)
	if block == nil { return nil, errors.New("invalid pem") }
	return x509.ParsePKCS1PrivateKey(block.Bytes)
}

func parseRSAPublicKeyFromPEM(b []byte) (*rsa.PublicKey, error) {
	block, _ := pem.Decode(b)
	if block == nil { return nil, errors.New("invalid pem") }
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil { return nil, err }
	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok { return nil, errors.New("not rsa public key") }
	return rsaPub, nil
}
