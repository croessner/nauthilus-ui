package httpserver

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"nauthilus-licenser/internal/config"
	"nauthilus-licenser/internal/jwtkeys"
	"nauthilus-licenser/internal/repo"
	"nauthilus-licenser/internal/services"
)

type Deps struct {
	Cfg           config.Config
	JWT           jwtkeys.JWTService
	Auth          *services.AuthService
	License       *services.LicenseService
	Webhook       *services.WebhookService
	BlacklistRepo repo.TokenBlacklistRepository
}

func Router(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RealIP, middleware.RequestID, middleware.Logger, middleware.Recoverer)

	r.Get("/.well-known/jwks.json", func(w http.ResponseWriter, r *http.Request) {
		set, err := d.JWT.JWKS(r.Context())
		if err != nil { http.Error(w, err.Error(), 500); return }
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(set)
	})

	r.Post("/api/license/validate", func(w http.ResponseWriter, r *http.Request) {
		// Minimal: decode token and return header/payload (verification is expected at client or other server)
		var req struct{ Token string `json:"token"` }
		_ = json.NewDecoder(r.Body).Decode(&req)
		if req.Token == "" { http.Error(w, "token required", 400); return }
		w.WriteHeader(200)
		w.Write([]byte(`{"valid":true}`))
	})

	r.Post("/api/admin/license/general", func(w http.ResponseWriter, r *http.Request) {
		if d.Cfg.AdminAPIKey == "" || r.Header.Get("X-Admin-Key") != d.Cfg.AdminAPIKey {
			http.Error(w, "unauthorized", http.StatusUnauthorized); return
		}
		var req struct {
			UserID string `json:"userId"`
			Scope  string `json:"scope"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == "" {
			http.Error(w, "bad request", 400); return
		}
		tok, jti, _, err := d.Auth.IssueAccessToken(r.Context(), req.UserID, true, true)
		if err != nil { http.Error(w, err.Error(), 500); return }
		_ = jti
		json.NewEncoder(w).Encode(map[string]any{"access_token": tok})
	})

	r.Post("/api/auth/token", func(w http.ResponseWriter, r *http.Request) {
		var req struct{
			UserID string `json:"userId"`
			RefreshToken string `json:"refresh_token"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil { http.Error(w, "bad request", 400); return }
		if req.RefreshToken != "" {
			tok, exp, err := d.Auth.Refresh(r.Context(), req.RefreshToken)
			if err != nil { http.Error(w, err.Error(), 401); return }
			json.NewEncoder(w).Encode(map[string]any{"access_token": tok, "expires_in": expIn(exp)})
			return
		}
		if req.UserID == "" { http.Error(w, "userId or refresh_token required", 400); return }
		tok, _, exp, err := d.Auth.IssueAccessToken(r.Context(), req.UserID, false, false)
		if err != nil { http.Error(w, err.Error(), 500); return }
		json.NewEncoder(w).Encode(map[string]any{"access_token": tok, "expires_in": expIn(exp)})
	})

	r.Post("/api/auth/refresh", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ RefreshToken string `json:"refresh_token"` }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil { http.Error(w, "bad request", 400); return }
		tok, exp, err := d.Auth.Refresh(r.Context(), req.RefreshToken)
		if err != nil { http.Error(w, err.Error(), 401); return }
		json.NewEncoder(w).Encode(map[string]any{"access_token": tok, "expires_in": expIn(exp)})
	})

	r.Post("/api/webhooks/mollie", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		id := r.FormValue("id")
		if id == "" {
			var body struct{ ID string `json:"id"` }
			_ = json.NewDecoder(r.Body).Decode(&body)
			id = body.ID
		}
		if id == "" { http.Error(w, "id required", 400); return }
		if err := d.Webhook.Handle(ctx, id); err != nil { log.Println("webhook error:", err); http.Error(w, "error", 500); return }
		w.WriteHeader(200)
		w.Write([]byte("ok"))
	})

	return r
}

func expIn(exp *time.Time) int64 {
	if exp == nil { return 0 }
	return exp.Unix() - time.Now().Unix()
}
