package requestmeta

import (
	"net/http/httptest"
	"testing"
)

func TestResolverIgnoresForwardedHeadersFromUntrustedRemote(t *testing.T) {
	resolver, err := NewResolver([]string{"127.0.0.1"})
	if err != nil {
		t.Fatalf("NewResolver returned error: %v", err)
	}

	req := httptest.NewRequest("GET", "http://internal.local/test", nil)
	req.RemoteAddr = "198.51.100.200:1234"
	req.Host = "internal.local"
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-Host", "ui.example.com")
	req.Header.Set("X-Forwarded-For", "203.0.113.10")

	info := resolver.Resolve(req)

	if info.TrustedProxy {
		t.Fatal("expected remote address to be untrusted")
	}
	if info.Scheme != "http" {
		t.Fatalf("expected scheme http, got %q", info.Scheme)
	}
	if info.Host != "internal.local" {
		t.Fatalf("expected host internal.local, got %q", info.Host)
	}
	if info.ClientIP != "198.51.100.200" {
		t.Fatalf("expected client IP to fall back to remote address, got %q", info.ClientIP)
	}
}

func TestResolverUsesForwardedHeadersFromTrustedProxy(t *testing.T) {
	resolver, err := NewResolver([]string{"127.0.0.1/32"})
	if err != nil {
		t.Fatalf("NewResolver returned error: %v", err)
	}

	req := httptest.NewRequest("GET", "http://internal.local/test", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	req.Host = "internal.local"
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-Host", "ui.example.com")
	req.Header.Set("X-Forwarded-For", "203.0.113.10, 127.0.0.1")

	info := resolver.Resolve(req)

	if !info.TrustedProxy {
		t.Fatal("expected remote address to be trusted")
	}
	if !info.Secure || info.Scheme != "https" {
		t.Fatalf("expected secure https request, got secure=%t scheme=%q", info.Secure, info.Scheme)
	}
	if info.Host != "ui.example.com" {
		t.Fatalf("expected forwarded host ui.example.com, got %q", info.Host)
	}
	if info.ClientIP != "203.0.113.10" {
		t.Fatalf("expected forwarded client IP 203.0.113.10, got %q", info.ClientIP)
	}
}

func TestResolverSupportsForwardedHeaderForTrustedProxy(t *testing.T) {
	resolver, err := NewResolver([]string{"127.0.0.1"})
	if err != nil {
		t.Fatalf("NewResolver returned error: %v", err)
	}

	req := httptest.NewRequest("GET", "http://internal.local/test", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	req.Host = "internal.local"
	req.Header.Set("Forwarded", `for=203.0.113.10;proto=https;host=ui.example.com`)

	info := resolver.Resolve(req)

	if info.Scheme != "https" || !info.Secure {
		t.Fatalf("expected forwarded proto to set secure https, got secure=%t scheme=%q", info.Secure, info.Scheme)
	}
	if info.Host != "ui.example.com" {
		t.Fatalf("expected forwarded host ui.example.com, got %q", info.Host)
	}
	if info.ClientIP != "203.0.113.10" {
		t.Fatalf("expected forwarded client IP 203.0.113.10, got %q", info.ClientIP)
	}
}
