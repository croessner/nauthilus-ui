package api

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/oauth2"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

// OIDCHandler handles OIDC login and callback
// This implementation is optional and only active if enabled via config/env.
type OIDCHandler struct {
	MongoDB *db.MongoDB
}

func NewOIDCHandler(mongoDB *db.MongoDB) *OIDCHandler {
	return &OIDCHandler{MongoDB: mongoDB}
}

// RegisterRoutes registers OIDC routes under /api/auth/oidc/*
func (h *OIDCHandler) RegisterRoutes(router *gin.Engine) {
	router.GET("/api/auth/oidc/login", h.StartLogin)
	router.GET("/api/auth/oidc/callback", h.Callback)
}

// StartLogin begins the OIDC authorization code flow
func (h *OIDCHandler) StartLogin(ctx *gin.Context) {
	cfg := h.MongoDB.Config

	if !cfg.OIDCEnabled {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "OIDC is disabled"})

		return
	}

	if cfg.OIDCIssuer == "" || cfg.OIDCClientID == "" || cfg.OIDCRedirectURL == "" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "OIDC not configured: issuer, clientID and redirectURL are required"})

		return
	}

	provider, err := oidc.NewProvider(ctx.Request.Context(), cfg.OIDCIssuer)
	if err != nil {
		slog.Error("OIDC: failed to create provider", "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "OIDC provider discovery failed"})

		return
	}

	scopes := []string{"openid", "profile", "email"}
	if cfg.OIDCScopes != "" {
		scopes = strings.Fields(cfg.OIDCScopes)
	}

	oauth2Config := oauth2.Config{
		ClientID:     cfg.OIDCClientID,
		ClientSecret: cfg.OIDCClientSecret,
		Endpoint:     provider.Endpoint(),
		RedirectURL:  cfg.OIDCRedirectURL,
		Scopes:       scopes,
	}

	// CSRF state - use a simple random string stored in a short-lived cookie
	state := fmt.Sprintf("st_%d", time.Now().UnixNano())

	// 5 minutes expiry
	cookie := &http.Cookie{Name: "oidc_state", Value: state, Path: "/", Expires: time.Now().Add(5 * time.Minute), HttpOnly: true, Secure: ctx.Request.TLS != nil}

	http.SetCookie(ctx.Writer, cookie)

	// redirect
	authURL := oauth2Config.AuthCodeURL(state)

	ctx.Redirect(http.StatusFound, authURL)
}

// Callback handles the redirect from the OIDC provider, exchanges code, verifies ID token,
// maps/creates the user, issues an application JWT, then redirects to frontend callback route
func (h *OIDCHandler) Callback(ctx *gin.Context) {
	cfg := h.MongoDB.Config
	if !cfg.OIDCEnabled {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "OIDC is disabled"})

		return
	}

	state := ctx.Query("state")
	code := ctx.Query("code")

	if state == "" || code == "" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Missing OIDC state or code"})

		return
	}

	// Validate state cookie
	stateCookie, err := ctx.Request.Cookie("oidc_state")
	if err != nil || stateCookie.Value != state {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid OIDC state"})

		return
	}

	// Invalidate state cookie
	stateCookie.Expires = time.Now().Add(-1 * time.Hour)
	http.SetCookie(ctx.Writer, stateCookie)

	provider, err := oidc.NewProvider(ctx.Request.Context(), cfg.OIDCIssuer)
	if err != nil {
		slog.Error("OIDC: provider discovery failed", "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "OIDC provider discovery failed"})

		return
	}

	scopes := []string{"openid", "profile", "email"}
	if cfg.OIDCScopes != "" {
		scopes = strings.Fields(cfg.OIDCScopes)
	}

	oauth2Config := oauth2.Config{
		ClientID:     cfg.OIDCClientID,
		ClientSecret: cfg.OIDCClientSecret,
		Endpoint:     provider.Endpoint(),
		RedirectURL:  cfg.OIDCRedirectURL,
		Scopes:       scopes,
	}

	token, err := oauth2Config.Exchange(ctx.Request.Context(), code)
	if err != nil {
		slog.Error("OIDC: token exchange failed", "error", err)
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "OIDC token exchange failed"})

		return
	}

	// Extract and verify ID token
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Missing id_token"})

		return
	}

	verifier := provider.Verifier(&oidc.Config{ClientID: cfg.OIDCClientID})

	idToken, err := verifier.Verify(ctx.Request.Context(), rawIDToken)
	if err != nil {
		slog.Error("OIDC: id token verify failed", "error", err)
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid id_token"})

		return
	}

	// Parse claims generically
	claims := map[string]interface{}{}
	if err := idToken.Claims(&claims); err != nil {
		slog.Error("OIDC: failed to parse claims", "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to parse id_token claims"})

		return
	}

	// Determine username
	username := ""
	switch cfg.OIDCUsernameClaim {
	case "email":
		if v, ok := claims["email"].(string); ok {
			username = v
		}
	case "sub":
		if v, ok := claims["sub"].(string); ok {
			username = v
		}
	default: // preferred_username
		if v, ok := claims[cfg.OIDCUsernameClaim].(string); ok {
			username = v
		}

		if username == "" {
			if v, ok := claims["preferred_username"].(string); ok {
				username = v
			}
		}
	}

	if username == "" {
		// fallback to sub
		if v, ok := claims["sub"].(string); ok {
			username = v
		}
	}

	if username == "" {
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Unable to determine username from id_token"})

		return
	}

	// Extract roles - support simple claim (e.g., roles) or nested realm_access.roles
	var roles []string

	roleClaim := cfg.OIDCRoleClaim
	if roleClaim == "" {
		roleClaim = "roles"
	}

	if strings.Contains(roleClaim, ".") {
		var cur any = claims

		// nested claim path
		parts := strings.Split(roleClaim, ".")
		for _, p := range parts {
			m, ok := cur.(map[string]interface{})
			if !ok {
				cur = nil

				break
			}

			cur = m[p]
		}

		if cur != nil {
			if arr, ok := cur.([]interface{}); ok {
				for _, v := range arr {
					if s, ok := v.(string); ok {
						roles = append(roles, s)
					}
				}
			}
		}
	} else {
		if arr, ok := claims[roleClaim].([]interface{}); ok {
			for _, v := range arr {
				if s, ok := v.(string); ok {
					roles = append(roles, s)
				}
			}
		}
	}

	if len(roles) == 0 {
		// Default to user role if nothing provided
		roles = []string{"user"}
	}

	// Ensure user exists or create a new one (without password)
	var user *models.User
	if h.MongoDB.IsConnectedToMongoDB() {
		existing, err := h.MongoDB.GetUserByUsername(username)
		if err != nil {
			slog.Error("OIDC: failed to fetch user", "error", err)
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Database error"})

			return
		}

		if existing == nil {
			now := time.Now().Format(time.RFC3339)
			u := models.User{
				Username:     username,
				PasswordHash: "", // no local password
				Roles:        roles,
				Enabled:      true,
				LastLogin:    nil,
				LastModified: now,
			}

			_, err := h.MongoDB.UserColl.InsertOne(ctx.Request.Context(), u)
			if err != nil {
				slog.Error("OIDC: failed to create user", "error", err)
				ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create user"})

				return
			}

			user = &u
		} else {
			// Optionally update roles from token
			_, _ = h.MongoDB.UserColl.UpdateOne(ctx.Request.Context(), map[string]interface{}{"username": username}, map[string]interface{}{"$set": map[string]interface{}{"roles": roles, "enabled": true, "lastModified": time.Now().Format(time.RFC3339)}})
			existing.Roles = roles
			existing.Enabled = true
			user = existing
		}
	} else {
		// DB not connected, synthesize user
		user = &models.User{Username: username, Roles: roles, Enabled: true}
	}

	// Issue application JWTs using same logic as password login
	// Read JWT Config
	jwtCfg, err := h.MongoDB.GetJWTConfig()
	if err != nil {
		slog.Error("OIDC: failed to get JWT config", "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate token"})

		return
	}

	// Create expiration using RememberMeExpiry for a longer default (or TokenExpiry if RememberMeExpiry not set)
	accessExpiry := jwtCfg.TokenExpiry
	if jwtCfg.RememberMeExpiry > 0 {
		accessExpiry = jwtCfg.RememberMeExpiry
	}

	// Generate access and refresh token (reuse code from auth handler inline)
	expiresAt := time.Now().Add(time.Duration(accessExpiry) * time.Second).Unix()
	jwtClaims := map[string]interface{}{
		"sub":   user.Username,
		"roles": user.Roles,
		"exp":   expiresAt,
		"iat":   time.Now().Unix(),
	}

	tokenStr, err := signHS256(jwtClaims, jwtCfg.Secret)
	if err != nil {
		slog.Error("OIDC: failed to sign token", "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to sign token"})

		return
	}

	refreshExp := time.Now().Add(time.Duration(jwtCfg.RefreshTokenExpiry) * time.Second).Unix()
	refreshClaims := map[string]interface{}{
		"sub":   user.Username,
		"roles": user.Roles,
		"exp":   refreshExp,
		"iat":   time.Now().Unix(),
	}

	refreshStr, err := signHS256(refreshClaims, jwtCfg.Secret)
	if err != nil {
		slog.Error("OIDC: failed to sign refresh token", "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to sign token"})

		return
	}

	// Redirect back to frontend callback route to set cookies in JS
	// Expect frontend route at /oidc/callback
	redirect := fmt.Sprintf("/oidc/callback?token=%s&refreshToken=%s&expiresAt=%d", urlQueryEscape(tokenStr), urlQueryEscape(refreshStr), expiresAt)
	ctx.Redirect(http.StatusFound, redirect)
}

// signHS256 signs simple map claims with HS256
// kept locally to avoid importing auth handler internals
func signHS256(claims map[string]interface{}, secret string) (string, error) {
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims(claims))

	return t.SignedString([]byte(secret))
}

// urlQueryEscape escapes special characters in a URL query string using percent-encoded values.
func urlQueryEscape(s string) string {
	replacer := strings.NewReplacer(
		"%", "%25",
		" ", "%20",
		"\"", "%22",
		"#", "%23",
		"&", "%26",
		"+", "%2B",
		",", "%2C",
		"/", "%2F",
		":", "%3A",
		";", "%3B",
		"=", "%3D",
		"?", "%3F",
		"@", "%40",
	)

	return replacer.Replace(s)
}
