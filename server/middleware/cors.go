package middleware

import (
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/config"
)

const (
	CORSAllowMethods  = "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD"
	CORSAllowHeaders  = "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, x-target-url, x-endpoint-path, x-operation, x-action, x-auth-type, x-auth-value, If-None-Match, If-Match, If-Modified-Since, If-Unmodified-Since, Range"
	CORSExposeHeaders = "Content-Length, Content-Range, ETag, Last-Modified, Accept-Ranges, Location, Content-Type, " + SessionAuthRequiredHeader
	corsMaxAge        = "86400"
	defaultVitePort   = "3000"
	defaultAPIPort    = "3001"
)

// CORSHandler handles CORS (Cross-Origin Resource Sharing).
type CORSHandler struct {
	policy *OriginPolicy
}

// OriginPolicy decides which browser origins are allowed for cross-origin requests.
type OriginPolicy struct {
	allowed map[string]struct{}
}

// NewCORSHandler creates a new CORSHandler.
func NewCORSHandler(cfg *config.Config) *CORSHandler {
	return &CORSHandler{policy: NewOriginPolicy(cfg)}
}

// NewOriginPolicy builds the origin allowlist from explicit config plus safe local defaults.
func NewOriginPolicy(cfg *config.Config) *OriginPolicy {
	if cfg == nil {
		cfg = &config.Config{}
	}

	allowed := make(map[string]struct{})

	explicitAllowlistConfigured := len(cfg.Security.CORS.AllowedOrigins) > 0
	for _, origin := range cfg.Security.CORS.AllowedOrigins {
		addAllowedOrigin(allowed, origin)
	}

	if !explicitAllowlistConfigured {
		for _, origin := range deriveDefaultOrigins(cfg) {
			addAllowedOrigin(allowed, origin)
		}
	}

	return &OriginPolicy{allowed: allowed}
}

func addAllowedOrigin(allowed map[string]struct{}, raw string) {
	if origin := normalizeOrigin(raw); origin != "" {
		allowed[origin] = struct{}{}
	}
}

func normalizeOrigin(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.Path != "" && parsed.Path != "/" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return ""
	}

	return strings.TrimRight(parsed.Scheme+"://"+parsed.Host, "/")
}

func normalizeHostForOrigin(host string) string {
	host = strings.TrimSpace(host)
	switch host {
	case "", "0.0.0.0", "::":
		return ""
	case "::1":
		return "[::1]"
	default:
		if addr, err := netip.ParseAddr(host); err == nil && addr.Is6() {
			return "[" + host + "]"
		}

		return host
	}
}

func originFromParts(scheme, host, port string) string {
	host = normalizeHostForOrigin(host)
	if host == "" {
		return ""
	}

	switch {
	case port == "", (scheme == "http" && port == "80"), (scheme == "https" && port == "443"):
		return scheme + "://" + host
	default:
		return scheme + "://" + host + ":" + port
	}
}

func deriveDefaultOrigins(cfg *config.Config) []string {
	hosts := []string{"localhost", "127.0.0.1", "[::1]"}
	for _, host := range []string{cfg.Server.Frontend.Address} {
		normalized := normalizeHostForOrigin(host)
		switch normalized {
		case "", "localhost", "127.0.0.1", "[::1]":
		default:
			continue
		}

		hosts = append(hosts, normalized)
	}

	ports := []string{
		defaultVitePort,
		portOrDefault(cfg.Server.Frontend.Port, defaultAPIPort),
	}

	origins := make([]string, 0, len(hosts)*len(ports))
	for _, host := range hosts {
		for _, port := range ports {
			if origin := originFromParts("http", host, port); origin != "" {
				origins = append(origins, origin)
			}
		}
	}

	return origins
}

func portOrDefault(port int, fallback string) string {
	if port <= 0 {
		return fallback
	}

	return strconv.Itoa(port)
}

func appendVary(header http.Header, value string) {
	if value == "" {
		return
	}

	current := header.Values("Vary")
	for _, existing := range current {
		for _, part := range strings.Split(existing, ",") {
			if strings.EqualFold(strings.TrimSpace(part), value) {
				return
			}
		}
	}

	header.Add("Vary", value)
}

// Apply sets CORS headers for allowed origins.
// It returns false when the request origin is present but not allowlisted.
func (p *OriginPolicy) Apply(ctx *gin.Context, exposeHeaders string) bool {
	header := ctx.Writer.Header()
	appendVary(header, "Origin")
	appendVary(header, "Access-Control-Request-Method")
	appendVary(header, "Access-Control-Request-Headers")

	origin := normalizeOrigin(ctx.GetHeader("Origin"))
	if origin == "" {
		return true
	}

	if _, ok := p.allowed[origin]; !ok {
		return false
	}

	header.Set("Access-Control-Allow-Origin", origin)
	header.Set("Access-Control-Allow-Credentials", "true")
	header.Set("Access-Control-Allow-Headers", CORSAllowHeaders)
	header.Set("Access-Control-Allow-Methods", CORSAllowMethods)
	header.Set("Access-Control-Max-Age", corsMaxAge)
	if exposeHeaders != "" {
		header.Set("Access-Control-Expose-Headers", exposeHeaders)
	}

	return true
}

// Allows reports whether the provided browser origin is allowlisted.
func (p *OriginPolicy) Allows(rawOrigin string) bool {
	origin := normalizeOrigin(rawOrigin)
	if origin == "" {
		return false
	}

	_, ok := p.allowed[origin]
	return ok
}

// RegisterMiddleware registers the CORS middleware.
func (h *CORSHandler) RegisterMiddleware(router *gin.Engine) {
	router.Use(func(ctx *gin.Context) {
		if ok := h.policy.Apply(ctx, CORSExposeHeaders); !ok {
			ctx.AbortWithStatus(http.StatusForbidden)
			return
		}

		if ctx.Request.Method == http.MethodOptions {
			ctx.AbortWithStatus(http.StatusNoContent)
			return
		}

		ctx.Next()
	})
}
