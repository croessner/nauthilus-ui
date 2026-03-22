package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/requestmeta"
)

const (
	permissionsPolicyValue = "geolocation=(), camera=(), microphone=(), usb=()"
	referrerPolicyValue    = "strict-origin-when-cross-origin"
	xFrameOptionsValue     = "DENY"
	coopValue              = "same-origin"
	corpValue              = "same-origin"
	hstsValue              = "max-age=31536000; includeSubDomains"
)

// SecurityHeadersHandler applies baseline browser security headers.
type SecurityHeadersHandler struct{}

// NewSecurityHeadersHandler creates a new security header middleware.
func NewSecurityHeadersHandler() *SecurityHeadersHandler {
	return &SecurityHeadersHandler{}
}

// RegisterMiddleware registers the security header middleware.
func (h *SecurityHeadersHandler) RegisterMiddleware(router *gin.Engine) {
	router.Use(func(ctx *gin.Context) {
		applySecurityHeaders(ctx.Writer.Header(), requestmeta.IsSecureRequest(ctx.Request))
		ctx.Next()
	})
}

func buildContentSecurityPolicy() string {
	directives := []string{
		"default-src 'self'",
		"base-uri 'self'",
		"object-src 'none'",
		"frame-ancestors 'none'",
		"form-action 'self'",
		"manifest-src 'self'",
		"script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob: https:",
		"font-src 'self' data:",
		"connect-src 'self' https://cdn.jsdelivr.net https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
		"frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
	}

	return strings.Join(directives, "; ")
}

func applySecurityHeaders(header http.Header, secure bool) {
	header.Set("Content-Security-Policy", buildContentSecurityPolicy())
	header.Set("Permissions-Policy", permissionsPolicyValue)
	header.Set("Referrer-Policy", referrerPolicyValue)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("X-Frame-Options", xFrameOptionsValue)
	header.Set("Cross-Origin-Opener-Policy", coopValue)
	header.Set("Cross-Origin-Resource-Policy", corpValue)

	if secure {
		header.Set("Strict-Transport-Security", hstsValue)
	} else {
		header.Del("Strict-Transport-Security")
	}
}
