package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

const (
	sessionKindAccess  = "access"
	sessionKindRefresh = "refresh"
)

var errSessionNotFound = errors.New("session not found")

type storedSession struct {
	TokenHash  string    `bson:"tokenHash"`
	Kind       string    `bson:"kind"`
	Username   string    `bson:"username"`
	RememberMe bool      `bson:"rememberMe"`
	ExpiresAt  time.Time `bson:"expiresAt"`
	CreatedAt  time.Time `bson:"createdAt"`
	LastSeenAt time.Time `bson:"lastSeenAt"`
	IP         string    `bson:"ip,omitempty"`
	UserAgent  string    `bson:"userAgent,omitempty"`
}

type issuedSessionPair struct {
	accessToken      string
	accessExpiresAt  time.Time
	refreshToken     string
	refreshExpiresAt time.Time
	rememberMe       bool
}

func issueSessionPair(ctx *gin.Context, mongoDB *db.MongoDB, user *models.User, rememberMe bool) (issuedSessionPair, error) {
	cfg, err := mongoDB.GetSessionConfig()
	if err != nil {
		return issuedSessionPair{}, err
	}

	now := time.Now().UTC()
	accessExpiresAt := now.Add(time.Duration(cfg.TokenExpiry) * time.Second)
	refreshExpirySeconds := cfg.RefreshTokenExpiry
	if rememberMe && cfg.RememberMeExpiry > 0 {
		refreshExpirySeconds = cfg.RememberMeExpiry
	}
	refreshExpiresAt := now.Add(time.Duration(refreshExpirySeconds) * time.Second)

	accessToken, err := generateOpaqueSessionToken()
	if err != nil {
		return issuedSessionPair{}, err
	}

	refreshToken, err := generateOpaqueSessionToken()
	if err != nil {
		return issuedSessionPair{}, err
	}

	if err := insertOpaqueSession(ctx.Request.Context(), mongoDB, bson.M{
		"tokenHash":  hashOpaqueSessionToken(accessToken),
		"kind":       sessionKindAccess,
		"expiresAt":  accessExpiresAt,
		"username":   user.Username,
		"rememberMe": rememberMe,
		"createdAt":  now,
		"lastSeenAt": now,
		"ip":         getClientIP(ctx.Request),
		"userAgent":  ctx.Request.UserAgent(),
	}); err != nil {
		return issuedSessionPair{}, err
	}

	if err := insertOpaqueSession(ctx.Request.Context(), mongoDB, bson.M{
		"tokenHash":  hashOpaqueSessionToken(refreshToken),
		"kind":       sessionKindRefresh,
		"expiresAt":  refreshExpiresAt,
		"username":   user.Username,
		"rememberMe": rememberMe,
		"createdAt":  now,
		"lastSeenAt": now,
		"ip":         getClientIP(ctx.Request),
		"userAgent":  ctx.Request.UserAgent(),
	}); err != nil {
		_ = deleteOpaqueSession(ctx.Request.Context(), mongoDB, accessToken, sessionKindAccess)
		return issuedSessionPair{}, err
	}

	return issuedSessionPair{
		accessToken:      accessToken,
		accessExpiresAt:  accessExpiresAt,
		refreshToken:     refreshToken,
		refreshExpiresAt: refreshExpiresAt,
		rememberMe:       rememberMe,
	}, nil
}

func generateOpaqueSessionToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func hashOpaqueSessionToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func insertOpaqueSession(ctx context.Context, mongoDB *db.MongoDB, document bson.M) error {
	if !mongoDB.IsConnectedToMongoDB() || mongoDB.SessionColl == nil {
		return errors.New("session storage unavailable")
	}

	_, err := mongoDB.SessionColl.InsertOne(ctx, document)
	return err
}

func findOpaqueSession(ctx context.Context, mongoDB *db.MongoDB, token string, kind string) (storedSession, error) {
	if token == "" || !mongoDB.IsConnectedToMongoDB() || mongoDB.SessionColl == nil {
		return storedSession{}, errSessionNotFound
	}

	var session storedSession
	err := mongoDB.SessionColl.FindOne(ctx, bson.M{
		"tokenHash": hashOpaqueSessionToken(token),
		"kind":      kind,
	}).Decode(&session)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return storedSession{}, errSessionNotFound
		}

		return storedSession{}, err
	}

	if session.ExpiresAt.IsZero() || time.Now().UTC().After(session.ExpiresAt) {
		_ = deleteOpaqueSession(ctx, mongoDB, token, kind)
		return storedSession{}, errSessionNotFound
	}

	_, _ = mongoDB.SessionColl.UpdateOne(ctx, bson.M{
		"tokenHash": session.TokenHash,
		"kind":      kind,
	}, bson.M{"$set": bson.M{"lastSeenAt": time.Now().UTC()}})

	return session, nil
}

func deleteOpaqueSession(ctx context.Context, mongoDB *db.MongoDB, token string, kind string) error {
	if token == "" || !mongoDB.IsConnectedToMongoDB() || mongoDB.SessionColl == nil {
		return nil
	}

	_, err := mongoDB.SessionColl.DeleteOne(ctx, bson.M{
		"tokenHash": hashOpaqueSessionToken(token),
		"kind":      kind,
	})
	return err
}

func deleteAllOpaqueSessionsForUser(ctx context.Context, mongoDB *db.MongoDB, username string) error {
	if username == "" || !mongoDB.IsConnectedToMongoDB() || mongoDB.SessionColl == nil {
		return nil
	}

	_, err := mongoDB.SessionColl.DeleteMany(ctx, bson.M{"username": username})
	return err
}

func readAccessTokenFromRequest(r *http.Request) string {
	if cookie, err := r.Cookie(accessCookieName); err == nil && cookie.Value != "" {
		return cookie.Value
	}

	return ""
}
