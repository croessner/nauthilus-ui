package requestmeta

import (
	"context"
	"net"
	"net/http"
	"strings"
)

type contextKey struct{}

// Info contains request metadata after applying trusted-proxy rules.
type Info struct {
	ClientIP     string
	Scheme       string
	Host         string
	Secure       bool
	TrustedProxy bool
}

// Resolver evaluates request metadata while trusting forwarded headers only from configured proxies.
type Resolver struct {
	trustedCIDRs []*net.IPNet
}

// NewResolver creates a trusted-proxy resolver from IP/CIDR strings.
func NewResolver(trustedProxies []string) (*Resolver, error) {
	cidrs := make([]*net.IPNet, 0, len(trustedProxies))
	for _, raw := range trustedProxies {
		entry := strings.TrimSpace(raw)
		if entry == "" {
			continue
		}

		if strings.Contains(entry, "/") {
			_, network, err := net.ParseCIDR(entry)
			if err != nil {
				return nil, err
			}

			cidrs = append(cidrs, network)
			continue
		}

		ip := net.ParseIP(entry)
		if ip == nil {
			return nil, &net.ParseError{Type: "IP address", Text: entry}
		}

		bits := 128
		if ip.To4() != nil {
			ip = ip.To4()
			bits = 32
		}

		cidrs = append(cidrs, &net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)})
	}

	return &Resolver{trustedCIDRs: cidrs}, nil
}

// Enrich resolves request metadata and stores it in the request context.
func (r *Resolver) Enrich(req *http.Request) *http.Request {
	info := r.Resolve(req)
	return req.WithContext(context.WithValue(req.Context(), contextKey{}, info))
}

// Resolve evaluates effective client IP, scheme and host for the request.
func (r *Resolver) Resolve(req *http.Request) Info {
	info := Info{
		ClientIP: remoteIP(req.RemoteAddr),
		Host:     strings.TrimSpace(req.Host),
	}

	if req.TLS != nil {
		info.Secure = true
		info.Scheme = "https"
	} else {
		info.Scheme = "http"
	}

	remote := net.ParseIP(info.ClientIP)
	info.TrustedProxy = remote != nil && r.isTrustedProxy(remote)
	if !info.TrustedProxy {
		if info.ClientIP == "" {
			info.ClientIP = strings.TrimSpace(req.RemoteAddr)
		}
		if info.Host == "" {
			info.Host = strings.TrimSpace(req.Host)
		}
		return info
	}

	if scheme := forwardedProto(req); scheme != "" {
		info.Scheme = scheme
		info.Secure = scheme == "https"
	}

	if host := forwardedHost(req); host != "" {
		info.Host = host
	}

	if clientIP := forwardedClientIP(req, r); clientIP != "" {
		info.ClientIP = clientIP
	}

	return info
}

// FromRequest returns request metadata, using context values when available.
func FromRequest(req *http.Request) Info {
	if req != nil {
		if info, ok := req.Context().Value(contextKey{}).(Info); ok {
			return info
		}
	}

	resolver, _ := NewResolver(nil)
	return resolver.Resolve(req)
}

// ClientIP returns the effective client IP for the request.
func ClientIP(req *http.Request) string {
	return FromRequest(req).ClientIP
}

// EffectiveScheme returns the effective request scheme.
func EffectiveScheme(req *http.Request) string {
	return FromRequest(req).Scheme
}

// EffectiveHost returns the effective request host.
func EffectiveHost(req *http.Request) string {
	return FromRequest(req).Host
}

// IsSecureRequest reports whether the effective request scheme is HTTPS.
func IsSecureRequest(req *http.Request) bool {
	return FromRequest(req).Secure
}

func (r *Resolver) isTrustedProxy(ip net.IP) bool {
	for _, network := range r.trustedCIDRs {
		if network.Contains(ip) {
			return true
		}
	}

	return false
}

func remoteIP(remoteAddr string) string {
	remoteAddr = strings.TrimSpace(remoteAddr)
	if remoteAddr == "" {
		return ""
	}

	if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
		return strings.TrimSpace(host)
	}

	return remoteAddr
}

func forwardedProto(req *http.Request) string {
	if value := firstCSVValue(req.Header.Get("X-Forwarded-Proto")); value != "" {
		switch strings.ToLower(value) {
		case "http", "https":
			return strings.ToLower(value)
		}
	}

	if value := firstForwardedParam(req.Header.Get("Forwarded"), "proto"); value != "" {
		switch strings.ToLower(value) {
		case "http", "https":
			return strings.ToLower(value)
		}
	}

	return ""
}

func forwardedHost(req *http.Request) string {
	if value := firstCSVValue(req.Header.Get("X-Forwarded-Host")); value != "" {
		return value
	}

	return firstForwardedParam(req.Header.Get("Forwarded"), "host")
}

func forwardedClientIP(req *http.Request, resolver *Resolver) string {
	if values := parseForwardedForChain(req.Header.Get("Forwarded")); len(values) > 0 {
		if ip := pickClientIP(values, resolver); ip != "" {
			return ip
		}
	}

	if values := splitHeaderValues(req.Header.Get("X-Forwarded-For")); len(values) > 0 {
		if ip := pickClientIP(values, resolver); ip != "" {
			return ip
		}
	}

	if value := normalizeIPToken(req.Header.Get("X-Real-IP")); value != "" {
		return value
	}

	return remoteIP(req.RemoteAddr)
}

func pickClientIP(values []string, resolver *Resolver) string {
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		if ip := normalizeIPToken(value); ip != "" {
			normalized = append(normalized, ip)
		}
	}

	for i := len(normalized) - 1; i >= 0; i-- {
		ip := net.ParseIP(normalized[i])
		if ip == nil {
			continue
		}

		if i == 0 || !resolver.isTrustedProxy(ip) {
			return normalized[i]
		}
	}

	if len(normalized) > 0 {
		return normalized[0]
	}

	return ""
}

func parseForwardedForChain(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}

	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		for _, item := range strings.Split(part, ";") {
			item = strings.TrimSpace(item)
			if len(item) < 4 || !strings.EqualFold(item[:4], "for=") {
				continue
			}

			values = append(values, strings.TrimSpace(item[4:]))
			break
		}
	}

	return values
}

func firstForwardedParam(raw, key string) string {
	for _, part := range strings.Split(raw, ",") {
		for _, item := range strings.Split(part, ";") {
			item = strings.TrimSpace(item)
			if item == "" {
				continue
			}

			pieces := strings.SplitN(item, "=", 2)
			if len(pieces) != 2 || !strings.EqualFold(strings.TrimSpace(pieces[0]), key) {
				continue
			}

			return strings.Trim(strings.TrimSpace(pieces[1]), "\"")
		}
	}

	return ""
}

func splitHeaderValues(raw string) []string {
	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			values = append(values, trimmed)
		}
	}

	return values
}

func firstCSVValue(raw string) string {
	values := splitHeaderValues(raw)
	if len(values) == 0 {
		return ""
	}

	return values[0]
}

func normalizeIPToken(raw string) string {
	value := strings.Trim(strings.TrimSpace(raw), "\"")
	if value == "" || strings.EqualFold(value, "unknown") {
		return ""
	}

	if strings.HasPrefix(value, "[") {
		end := strings.Index(value, "]")
		if end == -1 {
			return ""
		}

		value = value[1:end]
	}

	if host, _, err := net.SplitHostPort(value); err == nil {
		value = host
	}

	if ip := net.ParseIP(value); ip != nil {
		return ip.String()
	}

	return ""
}
