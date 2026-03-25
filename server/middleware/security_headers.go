package middleware

import (
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/config"
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
type SecurityHeadersHandler struct {
	cfg *config.Config
}

// NewSecurityHeadersHandler creates a new security header middleware.
func NewSecurityHeadersHandler(cfg *config.Config) *SecurityHeadersHandler {
	if cfg == nil {
		cfg = &config.Config{}
	}

	return &SecurityHeadersHandler{cfg: cfg}
}

// RegisterMiddleware registers the security header middleware.
func (h *SecurityHeadersHandler) RegisterMiddleware(router *gin.Engine) {
	router.Use(func(ctx *gin.Context) {
		applySecurityHeaders(ctx.Writer.Header(), requestmeta.IsSecureRequest(ctx.Request), ctx.Request, h.cfg)
		ctx.Next()
	})
}

func normalizeRequestHost(hostport string) string {
	hostport = strings.TrimSpace(hostport)
	if hostport == "" {
		return ""
	}

	host, _, err := net.SplitHostPort(hostport)
	if err == nil {
		return host
	}

	return hostport
}

func normalizeOriginHost(host string) string {
	host = strings.TrimSpace(host)
	if host == "" {
		return ""
	}

	if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
		return "[" + host + "]"
	}

	return host
}

func buildProxyConnectOrigin(req *http.Request, cfg *config.Config, secure bool) string {
	if req == nil || cfg == nil {
		return ""
	}

	publicPort := cfg.Server.Proxy.PublicPort
	if publicPort <= 0 {
		return ""
	}

	host := normalizeOriginHost(normalizeRequestHost(req.Host))
	if host == "" {
		return ""
	}

	scheme := "http"
	if secure {
		scheme = "https"
	}

	isDefaultPort := (scheme == "http" && publicPort == 80) || (scheme == "https" && publicPort == 443)
	if isDefaultPort {
		return scheme + "://" + host
	}

	return scheme + "://" + host + ":" + strconv.Itoa(publicPort)
}

func buildContentSecurityPolicy(req *http.Request, cfg *config.Config, secure bool) string {
	connectSources := []string{
		"'self'",
		"https://cdn.jsdelivr.net",
		"https://www.google.com/recaptcha/",
		"https://www.gstatic.com/recaptcha/",
	}

	if proxyOrigin := buildProxyConnectOrigin(req, cfg, secure); proxyOrigin != "" {
		connectSources = append(connectSources, proxyOrigin)
	}

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
		"connect-src " + strings.Join(connectSources, " "),
		"frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
	}

	return strings.Join(directives, "; ")
}

func applySecurityHeaders(header http.Header, secure bool, req *http.Request, cfg *config.Config) {
	header.Set("Content-Security-Policy", buildContentSecurityPolicy(req, cfg, secure))
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
