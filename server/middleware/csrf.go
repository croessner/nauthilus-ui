package middleware

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/api"
	"nauthilus-ui/server/config"
)

const (
	csrfHeaderName       = "X-CSRF-Token"
	accessCookieName     = "nauthilus_token"
	refreshCookieName    = "nauthilus_refresh_token"
	pendingMFACookieName = "nauthilus_mfa_pending"
	csrfCookieName       = "nauthilus_csrf_token"
)

// CSRFProtection validates mutating cookie-authenticated requests.
type CSRFProtection struct {
	originPolicy *OriginPolicy
}

// NewCSRFProtection creates a CSRF validator bound to the configured origin allowlist.
func NewCSRFProtection(cfg *config.Config) *CSRFProtection {
	return &CSRFProtection{originPolicy: NewOriginPolicy(cfg)}
}

// RegisterMiddleware registers the CSRF middleware.
func (p *CSRFProtection) RegisterMiddleware(router *gin.Engine) {
	router.Use(p.Middleware())
}

// Middleware returns the CSRF validation middleware.
func (p *CSRFProtection) Middleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if !isProtectedApplicationPath(ctx.Request.URL.Path) {
			ctx.Next()
			return
		}

		hasSessionCookie := hasCSRFSensitiveSessionCookie(ctx.Request)
		if hasSessionCookie && !requestHasCSRFCookie(ctx.Request) {
			if _, err := api.EnsureCSRFCookie(ctx); err != nil {
				ctx.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Failed to initialize CSRF protection"})
				return
			}
		}

		if !isStateChangingMethod(ctx.Request.Method) || !hasSessionCookie {
			ctx.Next()
			return
		}

		if !isTrustedBrowserOrigin(ctx.Request, p.originPolicy) {
			ctx.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "CSRF validation failed: origin not allowed"})
			return
		}

		if !hasValidDoubleSubmitToken(ctx.Request) {
			ctx.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "CSRF validation failed: missing or invalid token"})
			return
		}

		ctx.Next()
	}
}

func isProtectedApplicationPath(path string) bool {
	return strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/proxy/")
}

func isStateChangingMethod(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func hasCSRFSensitiveSessionCookie(r *http.Request) bool {
	for _, name := range []string{accessCookieName, refreshCookieName, pendingMFACookieName} {
		if cookie, err := r.Cookie(name); err == nil && cookie.Value != "" {
			return true
		}
	}

	return false
}

func requestHasCSRFCookie(r *http.Request) bool {
	cookie, err := r.Cookie(csrfCookieName)
	return err == nil && cookie.Value != ""
}

func hasValidDoubleSubmitToken(r *http.Request) bool {
	cookie, err := r.Cookie(csrfCookieName)
	if err != nil || cookie.Value == "" {
		return false
	}

	headerValue := strings.TrimSpace(r.Header.Get(csrfHeaderName))
	return headerValue != "" && headerValue == cookie.Value
}

func isTrustedBrowserOrigin(r *http.Request, policy *OriginPolicy) bool {
	if origin := strings.TrimSpace(r.Header.Get("Origin")); origin != "" {
		return policy.Allows(origin)
	}

	referer := strings.TrimSpace(r.Header.Get("Referer"))
	if referer == "" {
		return false
	}

	parsed, err := url.Parse(referer)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return false
	}

	return policy.Allows(parsed.Scheme + "://" + parsed.Host)
}
