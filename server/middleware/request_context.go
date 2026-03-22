package middleware

import (
	"log/slog"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/config"
	"nauthilus-ui/server/requestmeta"
)

// RequestContextHandler enriches requests with trusted-proxy-aware metadata.
type RequestContextHandler struct {
	resolver *requestmeta.Resolver
}

// NewRequestContextHandler creates a new request context handler.
func NewRequestContextHandler(cfg *config.Config) *RequestContextHandler {
	if cfg == nil {
		cfg = &config.Config{}
	}

	resolver, err := requestmeta.NewResolver(cfg.TrustedProxies)
	if err != nil {
		slog.Error("Invalid TRUSTED_PROXIES configuration; falling back to trust-none mode", "error", err)
		resolver, _ = requestmeta.NewResolver(nil)
	}

	return &RequestContextHandler{resolver: resolver}
}

// RegisterMiddleware registers the request context middleware.
func (h *RequestContextHandler) RegisterMiddleware(router *gin.Engine) {
	router.Use(func(ctx *gin.Context) {
		ctx.Request = h.resolver.Enrich(ctx.Request)
		ctx.Next()
	})
}
