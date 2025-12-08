package proxy

import (
	"bufio"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/api"
	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
	"nauthilus-ui/server/utils"
)

// ProxyHandler handles proxy requests to external services
type ProxyHandler struct {
	Mongo *db.MongoDB
}

// ProxyConfig holds configuration for a proxy request
type ProxyConfig struct {
	TargetURL       string
	EndpointPath    string
	Operation       string
	RequiresAuth    bool
	ContentType     string
	LogEndpoint     string
	UseReverseProxy bool
	SkipAudit       bool
}

// NewProxyHandler creates a new ProxyHandler
func NewProxyHandler(mongo *db.MongoDB) *ProxyHandler {
	return &ProxyHandler{Mongo: mongo}
}

// getTargetURL extracts and validates the target URL from the request
// Returns the target URL and a boolean indicating success
// If unsuccessful, also returns an HTTP status code and error message
func getTargetURL(ctx *gin.Context) (string, int, string, bool) {
	// Get target URL from query parameter or header
	targetURL := ctx.GetHeader("x-target-url")
	if targetURL == "" {
		targetURL = ctx.Query("url")
	}

	if targetURL == "" {
		return "", http.StatusBadRequest, "Target URL is required", false
	}

	// Validate the URL
	_, err := url.Parse(targetURL)
	if err != nil {
		return "", http.StatusBadRequest, "Invalid target URL", false
	}

	return targetURL, 0, "", true
}

// getEndpointPath extracts the endpoint path from the request
// Returns the endpoint path and a boolean indicating success
// If unsuccessful, also returns an HTTP status code and error message
func getEndpointPath(ctx *gin.Context) (string, int, string, bool) {
	// Get endpoint path from query parameter or header
	endpointPath := ctx.GetHeader("x-endpoint-path")
	if endpointPath == "" {
		endpointPath = ctx.Query("endpoint_path")
	}

	if endpointPath == "" {
		return "", http.StatusBadRequest, "Endpoint path is required", false
	}

	return endpointPath, 0, "", true
}

// getOperation extracts the operation/action from the request (accepts both for compatibility)
func getOperation(ctx *gin.Context) string {
	// Prefer explicit headers first
	operation := ctx.GetHeader("x-operation")
	if operation == "" {
		operation = ctx.Query("operation")
	}

	// Fallback to "action" naming if provided by client
	if operation == "" {
		operation = ctx.GetHeader("x-action")
		if operation == "" {
			operation = ctx.Query("action")
		}
	}

	return operation
}

// getAuthParams extracts authentication parameters from the request
func getAuthParams(ctx *gin.Context) (string, string) {
	// Get auth parameters from headers or query parameters
	authType := ctx.GetHeader("x-auth-type")
	authValue := ctx.GetHeader("x-auth-value")

	// If not in headers, try query parameters
	if authType == "" || authValue == "" {
		authType, authValue = utils.GetAuthorizationFromQuery(ctx.Request)
	}

	return authType, authValue
}

// copyHeaders copies headers from source to destination
func copyHeaders(dst http.Header, src http.Header) {
	for key, values := range src {
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

// getDecodedBody returns a reader that transparently decodes gzip if needed
func getDecodedBody(resp *http.Response) (io.ReadCloser, error) {
	ce := strings.ToLower(resp.Header.Get("Content-Encoding"))
	if ce == "gzip" {
		gzr, err := gzip.NewReader(resp.Body)
		if err != nil {
			return nil, err
		}

		return gzr, nil
	}

	return resp.Body, nil
}

// readAllDecoded reads entire response body handling gzip when present
func readAllDecoded(resp *http.Response) ([]byte, error) {
	rc, err := getDecodedBody(resp)
	if err != nil {
		return nil, err
	}

	defer func(rc io.ReadCloser) {
		_ = rc.Close()
	}(rc)

	return io.ReadAll(rc)
}

// handleProxyRequest handles the common proxy flow
func (h *ProxyHandler) handleProxyRequest(ctx *gin.Context, config ProxyConfig) {
	// Set CORS headers for non-OPTIONS requests
	origin := ctx.Request.Header.Get("Origin")
	if origin == "" {
		// Default to localhost:3000 for development
		origin = "http://localhost:3000"
	}

	ctx.Header("Access-Control-Allow-Origin", origin)
	ctx.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD")
	// Allow standard headers plus any requested by the browser in preflight
	allowReq := ctx.GetHeader("Access-Control-Request-Headers")
	baseAllow := "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, x-target-url, x-endpoint-path, x-operation, x-action, x-auth-type, x-auth-value, If-None-Match, If-Match, If-Modified-Since, If-Unmodified-Since, Range"
	if allowReq != "" {
		ctx.Header("Access-Control-Allow-Headers", baseAllow+", "+allowReq)
	} else {
		ctx.Header("Access-Control-Allow-Headers", baseAllow)
	}
	ctx.Header("Access-Control-Allow-Credentials", "true")
	// Expose important headers so browsers can access them on HEAD/GET responses
	ctx.Header("Access-Control-Expose-Headers", "Content-Length, Content-Range, ETag, Last-Modified, Accept-Ranges, Location")

	// Get and validate target URL if not provided
	if config.TargetURL == "" {
		var statusCode int
		var errMsg string
		var ok bool

		config.TargetURL, statusCode, errMsg, ok = getTargetURL(ctx)
		if !ok {
			// Audit failed proxy attempt (missing/invalid target URL)
			action := getOperation(ctx)

			h.writeAudit(ctx, config, models.AuditLogEntry{
				Action: action,
				Target: "proxy",
				Details: map[string]any{
					"status":        statusCode,
					"http_method":   ctx.Request.Method,
					"endpoint":      config.LogEndpoint,
					"endpoint_path": config.EndpointPath,
					"error":         errMsg,
					"query":         ctx.Request.URL.RawQuery,
				},
			})

			ctx.JSON(statusCode, models.ErrorResponse{Error: errMsg})

			return
		}
	}

	// Log the request (initial)
	if config.EndpointPath == "" {
		// Simple endpoint with a fixed path
		slog.Info("Handling proxy request", "endpoint", config.LogEndpoint, "method", ctx.Request.Method, "target", config.TargetURL)
	} else {
		// For endpoints with dynamic path
		slog.Info("Handling proxy request", "endpoint", config.LogEndpoint, "method", ctx.Request.Method, "target", config.TargetURL, "endpoint_path", config.EndpointPath)
	}

	// Parse the target URL
	target, err := url.Parse(config.TargetURL)
	if err != nil {
		// Audit invalid target URL format
		action := getOperation(ctx)

		h.writeAudit(ctx, config, models.AuditLogEntry{
			Action: action,
			Target: config.TargetURL,
			Details: map[string]any{
				"status":        http.StatusBadRequest,
				"http_method":   ctx.Request.Method,
				"endpoint":      config.LogEndpoint,
				"endpoint_path": config.EndpointPath,
				"error":         "Invalid target URL",
				"query":         ctx.Request.URL.RawQuery,
			},
		})

		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid target URL"})

		return
	}

	// Set the path
	target.Path = config.EndpointPath

	// Build outgoing query parameters by forwarding all non-internal query params
	q := target.Query()

	incoming := ctx.Request.URL.Query()
	internal := map[string]struct{}{
		"url":           {},
		"endpoint_path": {},
		"authType":      {},
		"authValue":     {},
	}

	// Forward all allowed incoming params, remapping operation->action
	if len(incoming) > 0 {
		// If both action and operation are present, prefer action
		actionAlreadySet := false
		if vals, ok := incoming["action"]; ok && len(vals) > 0 && vals[0] != "" {
			actionAlreadySet = true
		}
		for key, vals := range incoming {
			if _, skip := internal[key]; skip {
				continue
			}
			if len(vals) == 0 {
				continue
			}
			v := vals[0]
			if v == "" {
				continue
			}
			// Map legacy 'operation' to 'action' if action not already provided
			if key == "operation" {
				if !actionAlreadySet {
					q.Set("action", v)
				}
				continue
			}
			q.Set(key, v)
		}
	}

	// If an explicit Operation was provided via headers, set it as 'action' when not present
	if config.Operation != "" {
		if q.Get("action") == "" {
			q.Set("action", config.Operation)
		}
	}

	target.RawQuery = q.Encode()

	// Log the final target including query strings (incoming and outgoing)
	slog.Info("Proxy target prepared",
		"endpoint", config.LogEndpoint,
		"method", ctx.Request.Method,
		"target_host", target.Scheme+"://"+target.Host,
		"endpoint_path", config.EndpointPath,
		"out_query", target.RawQuery,
		"in_query", ctx.Request.URL.RawQuery,
	)

	// Use reverse proxy if specified
	if config.UseReverseProxy {
		proxy := httputil.NewSingleHostReverseProxy(target)

		// Modify the request
		originalDirector := proxy.Director
		proxy.Director = func(req *http.Request) {
			originalDirector(req)
			req.URL.Path = config.EndpointPath

			// Never forward incoming client Authorization header to the Nauthilus server
			// We only allow Proxy-generated Authorization built from query params
			req.Header.Del("Authorization")

			// Add authentication headers if required (from query params or headers x-auth-*)
			if config.RequiresAuth {
				authType, authValue := getAuthParams(ctx)
				utils.AddAuthorizationHeader(req, authType, authValue)
			}
		}

		// Handle errors
		proxy.ErrorHandler = func(rw http.ResponseWriter, req *http.Request, err error) {
			// Audit reverse proxy error
			action := getOperation(ctx)
			targetHost := target.Scheme + "://" + target.Host

			h.writeAudit(ctx, config, models.AuditLogEntry{
				Action: action,
				Target: targetHost + config.EndpointPath,
				Details: map[string]any{
					"status":        http.StatusBadGateway,
					"http_method":   ctx.Request.Method,
					"endpoint":      config.LogEndpoint,
					"endpoint_path": config.EndpointPath,
					"error":         err.Error(),
					"query":         ctx.Request.URL.RawQuery,
				},
			})

			ctx.JSON(http.StatusBadGateway, models.ErrorResponse{
				Error: "Failed to connect to backend server: " + err.Error(),
			})
		}

		// Serve the request
		proxy.ServeHTTP(ctx.Writer, ctx.Request)

		// Audit reverse proxy success (status from writer)
		{
			status := ctx.Writer.Status()
			action := getOperation(ctx)
			targetHost := target.Scheme + "://" + target.Host

			h.writeAudit(ctx, config, models.AuditLogEntry{
				Action: action,
				Target: targetHost + config.EndpointPath,
				Details: map[string]any{
					"status":        status,
					"http_method":   ctx.Request.Method,
					"endpoint":      config.LogEndpoint,
					"endpoint_path": config.EndpointPath,
					"query":         ctx.Request.URL.RawQuery,
				},
			})
		}

		return
	}

	// Create the proxy request
	req, err := http.NewRequest(ctx.Request.Method, target.String(), ctx.Request.Body)
	if err != nil {
		// Audit failure creating request
		action := getOperation(ctx)
		targetHost := target.Scheme + "://" + target.Host

		h.writeAudit(ctx, config, models.AuditLogEntry{
			Action: action,
			Target: targetHost + config.EndpointPath,
			Details: map[string]any{
				"status":        http.StatusInternalServerError,
				"http_method":   ctx.Request.Method,
				"endpoint":      config.LogEndpoint,
				"endpoint_path": config.EndpointPath,
				"error":         "Failed to create proxy request",
				"query":         ctx.Request.URL.RawQuery,
			},
		})

		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create proxy request"})

		return
	}

	// Copy headers from the original request
	copyHeaders(req.Header, ctx.Request.Header)

	// Never forward incoming client Authorization header to the Nauthilus server
	// Only allow Proxy-generated Authorization built from query params
	req.Header.Del("Authorization")

	// Add authentication headers if required
	if config.RequiresAuth {
		authType, authValue := getAuthParams(ctx)
		utils.AddAuthorizationHeader(req, authType, authValue)
	}

	// Set content type if specified
	if config.ContentType != "" {
		req.Header.Set("Content-Type", config.ContentType)
	}

	// Send the proxy request with a tuned Transport (no overall timeout to allow streaming)
	tr := &http.Transport{
		DialContext:           (&net.Dialer{Timeout: 10 * time.Second}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		IdleConnTimeout:       90 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
	}
	client := &http.Client{Transport: tr}

	resp, err := client.Do(req)
	if err != nil {
		// Audit backend connection failure
		action := getOperation(ctx)
		targetHost := target.Scheme + "://" + target.Host

		h.writeAudit(ctx, config, models.AuditLogEntry{
			Action: action,
			Target: targetHost + config.EndpointPath,
			Details: map[string]any{
				"status":        http.StatusInternalServerError,
				"http_method":   ctx.Request.Method,
				"endpoint":      config.LogEndpoint,
				"endpoint_path": config.EndpointPath,
				"error":         "Failed to connect to backend server: " + err.Error(),
				"query":         ctx.Request.URL.RawQuery,
			},
		})

		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to connect to backend server: " + err.Error()})

		return
	}

	defer func(Body io.ReadCloser) {
		_ = Body.Close()
	}(resp.Body)

	// Copy the response headers
	copyHeaders(ctx.Writer.Header(), resp.Header)

	// Ensure all backend headers are accessible to browser JS (CORS)
	{
		// Start with defaults already used in middleware/handler
		baseExpose := []string{"Content-Length", "Content-Range", "ETag", "Last-Modified", "Accept-Ranges", "Location", "Content-Type"}

		// Collect backend header names
		seen := map[string]struct{}{}
		for _, h := range baseExpose {
			seen[strings.ToLower(h)] = struct{}{}
		}

		for k := range resp.Header {
			lk := strings.ToLower(k)
			if _, ok := seen[lk]; !ok {
				baseExpose = append(baseExpose, k)
				seen[lk] = struct{}{}
			}
		}

		ctx.Header("Access-Control-Expose-Headers", strings.Join(baseExpose, ", "))
	}

	// Decide whether to gzip-compress the response to the browser
	shouldCompress := false
	if ctx.Request.Method != http.MethodHead {
		ce := strings.ToLower(resp.Header.Get("Content-Encoding"))
		ae := ctx.Request.Header.Get("Accept-Encoding")
		ct := resp.Header.Get("Content-Type")
		// Compress only when upstream did not already compress, client accepts gzip, and type is compressible
		if ce == "" && strings.Contains(ae, "gzip") {
			if strings.HasPrefix(strings.ToLower(ct), "application/json") || strings.HasPrefix(strings.ToLower(ct), "text/") {
				shouldCompress = true
			}
		}
	}

	if shouldCompress {
		// We will change the encoding; remove any Content-Length and set Content-Encoding
		h := ctx.Writer.Header()
		h.Del("Content-Length")
		h.Set("Content-Encoding", "gzip")
		// Make caches aware
		if v := h.Get("Vary"); v == "" {
			h.Set("Vary", "Accept-Encoding")
		} else if !strings.Contains(v, "Accept-Encoding") {
			h.Set("Vary", v+", Accept-Encoding")
		}
	}

	// Set the status code
	ctx.Writer.WriteHeader(resp.StatusCode)

	// Copy the response body only for non-HEAD requests
	if ctx.Request.Method != http.MethodHead {
		if shouldCompress {
			gz := gzip.NewWriter(ctx.Writer)
			defer func() { _ = gz.Close() }()
			_, _ = io.Copy(gz, resp.Body)
		} else {
			_, _ = io.Copy(ctx.Writer, resp.Body)
		}
	}

	// Audit direct proxy response
	{
		action := getOperation(ctx)
		targetHost := target.Scheme + "://" + target.Host

		h.writeAudit(ctx, config, models.AuditLogEntry{
			Action: action,
			Target: targetHost + config.EndpointPath,
			Details: map[string]any{
				"status":        resp.StatusCode,
				"http_method":   ctx.Request.Method,
				"endpoint":      config.LogEndpoint,
				"endpoint_path": config.EndpointPath,
				"query":         ctx.Request.URL.RawQuery,
			},
		})
	}
}

// RegisterRoutes registers the proxy routes
func (h *ProxyHandler) RegisterRoutes(router *gin.Engine) {
	// Add a middleware to handle CORS for all proxy routes
	router.Use(func(ctx *gin.Context) {
		// Set CORS headers for all requests
		origin := ctx.Request.Header.Get("Origin")
		if origin == "" {
			// Default to localhost:3000 for development
			origin = "http://localhost:3000"
		}

		ctx.Header("Access-Control-Allow-Origin", origin)
		ctx.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD")
		// Allow standard headers plus any requested by the browser in preflight
		allowReq := ctx.GetHeader("Access-Control-Request-Headers")
		baseAllow := "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, x-target-url, x-endpoint-path, x-operation, x-action, x-auth-type, x-auth-value, If-None-Match, If-Match, If-Modified-Since, If-Unmodified-Since, Range"
		if allowReq != "" {
			ctx.Header("Access-Control-Allow-Headers", baseAllow+", "+allowReq)
		} else {
			ctx.Header("Access-Control-Allow-Headers", baseAllow)
		}
		ctx.Header("Access-Control-Allow-Credentials", "true")
		// Expose important headers so browsers can access them on HEAD/GET responses
		ctx.Header("Access-Control-Expose-Headers", "Content-Length, Content-Range, ETag, Last-Modified, Accept-Ranges, Location")
		ctx.Header("Access-Control-Max-Age", "86400") // 24 hours

		// Handle preflight OPTIONS requests
		if ctx.Request.Method == "OPTIONS" {
			ctx.AbortWithStatus(204)
			return
		}

		ctx.Next()
	})

	// Register the actual route handlers
	router.GET("/proxy/ping", h.PingProxy)
	router.POST("/proxy/ping", h.PingProxy)

	router.GET("/proxy/jwt-token", h.JWTTokenProxy)
	router.POST("/proxy/jwt-token", h.JWTTokenProxy)

	router.GET("/proxy/bruteforce/list", h.BruteforceListProxy)
	router.POST("/proxy/bruteforce/list", h.BruteforceListProxy)

	router.GET("/proxy/cache/flush", h.CacheFlushProxy)
	router.POST("/proxy/cache/flush", h.CacheFlushProxy)
	router.DELETE("/proxy/cache/flush", h.CacheFlushProxy)
	// Async variant for cache flush
	router.DELETE("/proxy/cache/flush/async", h.CacheFlushAsyncProxy)

	router.GET("/proxy/bruteforce/flush", h.BruteforceFlushProxy)
	router.POST("/proxy/bruteforce/flush", h.BruteforceFlushProxy)
	router.DELETE("/proxy/bruteforce/flush", h.BruteforceFlushProxy)
	// Async variant for brute-force flush
	router.DELETE("/proxy/bruteforce/flush/async", h.BruteforceFlushAsyncProxy)

	router.GET("/proxy/config/load", h.ConfigLoadProxy)
	router.POST("/proxy/config/load", h.ConfigLoadProxy)

	// Hook proxy routes
	router.GET("/proxy/hooks/distributed-brute-force-admin", h.DistributedBruteForceAdminProxy)
	router.POST("/proxy/hooks/distributed-brute-force-admin", h.DistributedBruteForceAdminProxy)

	router.GET("/proxy/hooks/distributed-brute-force-test", h.DistributedBruteForceTestProxy)
	router.POST("/proxy/hooks/distributed-brute-force-test", h.DistributedBruteForceTestProxy)

	// Generic hook proxy route (all methods)
	router.Any("/proxy/hooks/any", h.HookGenericProxy)

	// System metrics route
	router.GET("/proxy/system/metrics", h.SystemMetricsProxy)
	// Security metrics route
	router.GET("/proxy/security/metrics", h.SecurityMetricsProxy)

	// IPAPI capability and lookup routes
	router.GET("/proxy/ipapi/status", h.IpapiStatus)
	router.GET("/proxy/ipapi/lookup", h.IpapiLookupProxy)
	// Async job status polling
	router.GET("/proxy/async/:jobId/status", h.AsyncJobStatusProxy)
}

// PingProxy handles the /proxy/ping endpoint
func (h *ProxyHandler) PingProxy(ctx *gin.Context) {
	config := ProxyConfig{
		EndpointPath: "/ping",
		LogEndpoint:  "/proxy/ping",
		RequiresAuth: false,
		SkipAudit:    true,
	}

	h.handleProxyRequest(ctx, config)
}

// JWTTokenProxy handles the /proxy/jwt-token endpoint
func (h *ProxyHandler) JWTTokenProxy(ctx *gin.Context) {
	config := ProxyConfig{
		EndpointPath: "/api/v1/jwt/token",
		LogEndpoint:  "/proxy/jwt-token",
		RequiresAuth: false,
		ContentType:  "application/json",
	}

	h.handleProxyRequest(ctx, config)
}

// BruteforceListProxy handles the /proxy/bruteforce/list endpoint
func (h *ProxyHandler) BruteforceListProxy(ctx *gin.Context) {
	config := ProxyConfig{
		EndpointPath: "/api/v1/bruteforce/list",
		LogEndpoint:  "/proxy/bruteforce/list",
		RequiresAuth: true,
	}

	h.handleProxyRequest(ctx, config)
}

// CacheFlushProxy handles the /proxy/cache/flush endpoint
func (h *ProxyHandler) CacheFlushProxy(ctx *gin.Context) {
	config := ProxyConfig{
		EndpointPath: "/api/v1/cache/flush",
		LogEndpoint:  "/proxy/cache/flush",
		RequiresAuth: true,
		ContentType:  "application/json",
	}

	h.handleProxyRequest(ctx, config)
}

// CacheFlushAsyncProxy handles the /proxy/cache/flush/async endpoint
func (h *ProxyHandler) CacheFlushAsyncProxy(ctx *gin.Context) {
	config := ProxyConfig{
		EndpointPath: "/api/v1/cache/flush/async",
		LogEndpoint:  "/proxy/cache/flush/async",
		RequiresAuth: true,
		ContentType:  "application/json",
	}

	h.handleProxyRequest(ctx, config)
}

// getIPFromCIDR extracts a specific IP address from a CIDR notation
// For IPv4 addresses with mask not equal to /32 and IPv6 addresses with mask not equal to /128,
// it returns the first usable IP address in the range
func getIPFromCIDR(ipStr string) string {
	// Check if the IP contains a CIDR mask
	if !strings.Contains(ipStr, "/") {
		return ipStr // Not a CIDR notation, return as is
	}

	// Parse the CIDR notation
	ip, ipNet, err := net.ParseCIDR(ipStr)
	if err != nil {
		slog.Error("Failed to parse CIDR notation", "ip", ipStr, "error", err)

		return ipStr // Return original if parsing fails
	}

	// Check if it's a single IP address (/32 for IPv4 or /128 for IPv6)
	ones, bits := ipNet.Mask.Size()
	if (bits == 32 && ones == 32) || (bits == 128 && ones == 128) {
		return ip.String() // It's already a single IP
	}

	// For IPv4 with mask not /32 or IPv6 with mask not /128,
	// return the first usable IP in the range (network address + 1)
	// Convert IP to 4/16 byte representation
	ipBytes := ip.To4()
	if ipBytes == nil {
		ipBytes = ip.To16() // IPv6
	}

	// Increment the last byte to get the first usable IP
	// This is a simple approach - for more complex scenarios, a more sophisticated
	// algorithm might be needed
	ipBytes[len(ipBytes)-1]++

	return ipBytes.String()
}

// BruteforceFlushProxy handles the /proxy/bruteforce/flush endpoint
func (h *ProxyHandler) BruteforceFlushProxy(ctx *gin.Context) {
	// For DELETE requests, we need to modify the IP address in the request body
	if ctx.Request.Method == "DELETE" {
		// Read the request body
		var requestBody map[string]interface{}
		bodyData, err := io.ReadAll(ctx.Request.Body)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Failed to read request body"})

			return
		}

		// Close the original body
		_ = ctx.Request.Body.Close()

		// Parse the JSON body
		if err := json.Unmarshal(bodyData, &requestBody); err != nil {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Failed to parse request body"})

			return
		}

		// Check if ip_address field exists
		if ipAddress, ok := requestBody["ip_address"].(string); ok {
			// Convert CIDR to specific IP if needed
			requestBody["ip_address"] = getIPFromCIDR(ipAddress)

			// Convert back to JSON
			modifiedBody, err := json.Marshal(requestBody)
			if err != nil {
				ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to encode modified request body"})

				return
			}

			// Create a new body with the modified data
			ctx.Request.Body = io.NopCloser(strings.NewReader(string(modifiedBody)))

			// Update Content-Length header
			ctx.Request.ContentLength = int64(len(modifiedBody))

			slog.Info("Modified IP address in request", "original", ipAddress, "modified", requestBody["ip_address"])
		}
	}

	config := ProxyConfig{
		EndpointPath: "/api/v1/bruteforce/flush",
		LogEndpoint:  "/proxy/bruteforce/flush",
		RequiresAuth: true,
		ContentType:  "application/json",
	}

	h.handleProxyRequest(ctx, config)
}

// BruteforceFlushAsyncProxy handles the /proxy/bruteforce/flush/async endpoint
func (h *ProxyHandler) BruteforceFlushAsyncProxy(ctx *gin.Context) {
	config := ProxyConfig{
		EndpointPath: "/api/v1/bruteforce/flush/async",
		LogEndpoint:  "/proxy/bruteforce/flush/async",
		RequiresAuth: true,
		ContentType:  "application/json",
	}

	h.handleProxyRequest(ctx, config)
}

// AsyncJobStatusProxy handles the /proxy/async/:jobId/status endpoint
func (h *ProxyHandler) AsyncJobStatusProxy(ctx *gin.Context) {
	jobID := ctx.Param("jobId")
	if jobID == "" {
		ctx.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "jobId is required"})
		return
	}

	// Backend expects /api/v1/async/jobs/:jobId (no trailing /status segment)
	endpoint := "/api/v1/async/jobs/" + jobID

	config := ProxyConfig{
		EndpointPath: endpoint,
		LogEndpoint:  "/proxy/async/:jobId/status",
		RequiresAuth: true,
	}

	h.handleProxyRequest(ctx, config)
}

// ConfigLoadProxy handles the /proxy/config/load endpoint
func (h *ProxyHandler) ConfigLoadProxy(ctx *gin.Context) {
	config := ProxyConfig{
		EndpointPath:    "/api/v1/config/load",
		LogEndpoint:     "/proxy/config/load",
		RequiresAuth:    true,
		UseReverseProxy: true,
	}

	h.handleProxyRequest(ctx, config)
}

// DistributedBruteForceAdminProxy handles the /proxy/hooks/distributed-brute-force-admin endpoint
func (h *ProxyHandler) DistributedBruteForceAdminProxy(ctx *gin.Context) {
	// Get endpoint path
	endpointPath, statusCode, errMsg, ok := getEndpointPath(ctx)
	if !ok {
		ctx.JSON(statusCode, models.ErrorResponse{Error: errMsg})

		return
	}

	config := ProxyConfig{
		EndpointPath: endpointPath,
		LogEndpoint:  "/proxy/hooks/distributed-brute-force-admin",
		RequiresAuth: true,
		ContentType:  "application/json",
		Operation:    getOperation(ctx),
	}

	h.handleProxyRequest(ctx, config)
}

// DistributedBruteForceTestProxy handles the /proxy/hooks/distributed-brute-force-test endpoint
func (h *ProxyHandler) DistributedBruteForceTestProxy(ctx *gin.Context) {
	// Get endpoint path
	endpointPath, statusCode, errMsg, ok := getEndpointPath(ctx)
	if !ok {
		ctx.JSON(statusCode, models.ErrorResponse{Error: errMsg})

		return
	}

	config := ProxyConfig{
		EndpointPath: endpointPath,
		LogEndpoint:  "/proxy/hooks/distributed-brute-force-test",
		RequiresAuth: true,
		ContentType:  "application/json",
		Operation:    getOperation(ctx),
	}

	h.handleProxyRequest(ctx, config)
}

// HookGenericProxy handles the /proxy/hooks/any endpoint for arbitrary hooks and methods
func (h *ProxyHandler) HookGenericProxy(ctx *gin.Context) {
	// Get endpoint path
	endpointPath, statusCode, errMsg, ok := getEndpointPath(ctx)
	if !ok {
		ctx.JSON(statusCode, models.ErrorResponse{Error: errMsg})

		return
	}

	config := ProxyConfig{
		EndpointPath: endpointPath,
		LogEndpoint:  "/proxy/hooks/any",
		RequiresAuth: true,
		// Do not set ContentType to preserve incoming Content-Type header for arbitrary content
		Operation: getOperation(ctx),
	}

	h.handleProxyRequest(ctx, config)
}

// SystemMetricsProxy fetches OpenMetrics/Prometheus metrics and returns selected values as JSON
func (h *ProxyHandler) SystemMetricsProxy(ctx *gin.Context) {
	// Resolve target base URL
	targetURL, statusCode, errMsg, ok := getTargetURL(ctx)
	if !ok {
		ctx.JSON(statusCode, models.ErrorResponse{Error: errMsg})

		return
	}

	// Build metrics URL
	u, err := url.Parse(targetURL)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid target URL"})

		return
	}

	u.Path = "/metrics"

	// Prepare request
	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create request"})

		return
	}

	// Explicitly request identity to avoid gzipped metrics when possible
	req.Header.Set("Accept-Encoding", "identity")

	// Add backend auth if provided
	authType, authValue := getAuthParams(ctx)
	if authType != "" && authValue != "" {
		utils.AddAuthorizationHeader(req, authType, authValue)
	}

	client := &http.Client{Timeout: 10 * time.Second}

	resp, err := client.Do(req)
	if err != nil {
		ctx.JSON(http.StatusBadGateway, models.ErrorResponse{Error: "Failed to fetch metrics: " + err.Error()})

		return
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := readAllDecoded(resp)
		ctx.JSON(http.StatusBadGateway, models.ErrorResponse{Error: "Backend returned status " + strconv.Itoa(resp.StatusCode) + ": " + string(body)})

		return
	}

	// Parse OpenMetrics/Prometheus text format
	decodedBody, err := getDecodedBody(resp)
	if err != nil {
		ctx.JSON(http.StatusBadGateway, models.ErrorResponse{Error: "Failed to decode metrics: " + err.Error()})

		return
	}

	defer func(decodedBody io.ReadCloser) {
		_ = decodedBody.Close()
	}(decodedBody)

	scanner := bufio.NewScanner(decodedBody)
	// Simple regex to capture: name{labels} value or name value
	metricLine := regexp.MustCompile(`^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*})?\s+([+-]?(?:\d+\.?\d*|\.?\d+)(?:[eE][+-]?\d+)?)`)
	labelVersion := regexp.MustCompile(`(?:^|[,{])\s*version\s*=\s*"([^"]+)"`)
	labelInstance := regexp.MustCompile(`(?:^|[,{])\s*(?:instance_name|instance|name)\s*=\s*"([^"]+)"`)

	var (
		processCPUSeconds float64
		processRSSBytes   float64
		goAllocBytes      float64
		goGoroutines      float64
		goThreads         float64
		processStartTime  float64
		version           string
		instanceName      string

		cpuUserUsagePercent   float64
		cpuSystemUsagePercent float64
		cpuIdleUsagePercent   float64

		connectionsCurrent float64
		seenConnections    bool

		redisUp               float64
		seenRedisUp           bool
		redisConnectedClients float64
		seenRedisClients      bool
		redisUsedMemoryBytes  float64
		seenRedisMem          bool
		redisKeyspaceHits     float64
		seenRedisHits         bool
		redisKeyspaceMisses   float64
		seenRedisMisses       bool
		redisRole             string
		seenRedisRole         bool
	)

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "#") || strings.TrimSpace(line) == "" {
			continue
		}

		m := metricLine.FindStringSubmatch(line)
		if len(m) == 0 {
			continue
		}

		name := m[1]
		labels := m[2]
		valStr := m[3]
		v, _ := strconv.ParseFloat(valStr, 64)

		switch name {
		case "process_cpu_seconds_total":
			processCPUSeconds = v
		case "process_resident_memory_bytes":
			processRSSBytes = v
		case "go_memstats_alloc_bytes":
			goAllocBytes = v
		case "go_goroutines":
			goGoroutines = v
		case "go_threads":
			goThreads = v
		case "process_start_time_seconds":
			processStartTime = v
		case "nauthilus_version_info":
			if labels != "" {
				if mm := labelVersion.FindStringSubmatch(labels); len(mm) == 2 {
					version = mm[1]
				}

				if mi := labelInstance.FindStringSubmatch(labels); len(mi) == 2 {
					instanceName = mi[1]
				}
			}
		case "cpu_user_usage_percent":
			cpuUserUsagePercent = v
		case "cpu_system_usage_percent":
			cpuSystemUsagePercent = v
		case "cpu_idle_usage_percent":
			cpuIdleUsagePercent = v
		// Connections — support a few possible metric names
		case "nauthilus_connections_current", "nauthilus_active_connections", "server_connections_current", "current_active_connections", "server_concurrent_requests":
			connectionsCurrent = v
			seenConnections = true
		// Redis exporter metrics
		case "redis_up":
			redisUp = v
			seenRedisUp = true
		case "redis_connected_clients":
			redisConnectedClients = v
			seenRedisClients = true
		case "redis_memory_used_bytes", "redis_used_memory_bytes":
			redisUsedMemoryBytes = v
			seenRedisMem = true
		case "redis_keyspace_hits_total", "redis_keyspace_hits":
			redisKeyspaceHits = v
			seenRedisHits = true
		case "redis_keyspace_misses_total", "redis_keyspace_misses":
			redisKeyspaceMisses = v
			seenRedisMisses = true
		case "redis_instance_info":
			// Try to extract role label if present
			if labels != "" {
				if strings.Contains(labels, "role=") {
					roleRe := regexp.MustCompile(`(?:^|,|\{)\s*role\s*=\s*"([^"]+)"`)
					if rm := roleRe.FindStringSubmatch(labels); len(rm) == 2 {
						redisRole = rm[1]
						seenRedisRole = true
					}
				}
			}
		case "up":
			// Generic Prometheus 'up' metric; consider it Redis status if job label indicates redis
			if labels != "" {
				jobRe := regexp.MustCompile(`(?:^|,|\{)\s*job\s*=\s*"([^"]+)"`)
				if jm := jobRe.FindStringSubmatch(labels); len(jm) == 2 {
					if strings.Contains(strings.ToLower(jm[1]), "redis") {
						redisUp = v
						seenRedisUp = true
					}
				}
			}
		}
	}

	// Compute uptime if start time available
	uptime := 0.0
	if processStartTime > 0 {
		uptime = time.Since(time.Unix(int64(processStartTime), 0)).Seconds()
	}

	// Derive Redis up if not explicitly exposed but clear activity is present
	if !seenRedisUp {
		if seenRedisClients && redisConnectedClients > 0 {
			redisUp = 1
			seenRedisUp = true
		}
	}

	result := gin.H{
		"timestamp_ms":                  time.Now().UnixMilli(),
		"version":                       version,
		"instance":                      instanceName,
		"uptime_seconds":                uptime,
		"process_cpu_seconds_total":     processCPUSeconds,
		"process_resident_memory_bytes": processRSSBytes,
		"go_memstats_alloc_bytes":       goAllocBytes,
		"go_goroutines":                 goGoroutines,
		"go_threads":                    goThreads,
		"cpu_user_usage_percent":        cpuUserUsagePercent,
		"cpu_system_usage_percent":      cpuSystemUsagePercent,
		"cpu_idle_usage_percent":        cpuIdleUsagePercent,
	}

	// Optional fields: only include if observed
	if seenConnections {
		result["connections_current"] = connectionsCurrent
	}

	if seenRedisUp {
		result["redis_up"] = redisUp
	}

	if seenRedisClients {
		result["redis_connected_clients"] = redisConnectedClients
	}

	if seenRedisMem {
		result["redis_used_memory_bytes"] = redisUsedMemoryBytes
	}

	if seenRedisHits {
		result["redis_keyspace_hits"] = redisKeyspaceHits
	}

	if seenRedisMisses {
		result["redis_keyspace_misses"] = redisKeyspaceMisses
	}

	if seenRedisRole {
		result["redis_role"] = redisRole
	}

	// Audit system metrics proxy success
	action := getOperation(ctx)
	targetHost := u.Scheme + "://" + u.Host

	api.WriteAudit(ctx, h.Mongo, models.AuditLogEntry{
		Action: action,
		Target: targetHost + "/metrics",
		Details: map[string]any{
			"status":        http.StatusOK,
			"http_method":   ctx.Request.Method,
			"endpoint":      "/proxy/system/metrics",
			"endpoint_path": "/metrics",
			"query":         ctx.Request.URL.RawQuery,
		},
	})

	ctx.JSON(http.StatusOK, result)
}

// SecurityMetricsProxy fetches security_* metrics and returns structured JSON
func (h *ProxyHandler) SecurityMetricsProxy(ctx *gin.Context) {
	// Resolve target base URL
	targetURL, statusCode, errMsg, ok := getTargetURL(ctx)
	if !ok {
		ctx.JSON(statusCode, models.ErrorResponse{Error: errMsg})

		return
	}

	// Build metrics URL
	u, err := url.Parse(targetURL)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid target URL"})

		return
	}

	u.Path = "/metrics"

	// Prepare request
	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create request"})

		return
	}

	// Explicitly request identity to avoid gzipped metrics when possible
	req.Header.Set("Accept-Encoding", "identity")

	// Add backend auth if provided
	authType, authValue := getAuthParams(ctx)
	if authType != "" && authValue != "" {
		utils.AddAuthorizationHeader(req, authType, authValue)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		ctx.JSON(http.StatusBadGateway, models.ErrorResponse{Error: "Failed to fetch metrics: " + err.Error()})

		return
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := readAllDecoded(resp)
		ctx.JSON(http.StatusBadGateway, models.ErrorResponse{Error: "Backend returned status " + strconv.Itoa(resp.StatusCode) + ": " + string(body)})

		return
	}

	// Parse OpenMetrics/Prometheus text format focusing on security_* metrics
	decodedBody, err := getDecodedBody(resp)
	if err != nil {
		ctx.JSON(http.StatusBadGateway, models.ErrorResponse{Error: "Failed to decode metrics: " + err.Error()})

		return
	}

	defer func(decodedBody io.ReadCloser) {
		_ = decodedBody.Close()
	}(decodedBody)

	scanner := bufio.NewScanner(decodedBody)
	metricLine := regexp.MustCompile(`^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*})?\s+([+-]?(?:\d+\.?\d*|\.?\d+)(?:[eE][+-]?\d+)?)`)
	labelKVP := regexp.MustCompile(`([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"([^"]*)"`)

	// Data structures
	type perUserMetric struct {
		Username string  `json:"username"`
		Window   string  `json:"window"`
		Value    float64 `json:"value"`
	}

	type perWindowMetric struct {
		Window string  `json:"window"`
		Value  float64 `json:"value"`
	}

	var (
		uniqueIPsPerUser          []perUserMetric
		failBudgetUsed            []perUserMetric
		globalIPsPerUser          []perWindowMetric
		accountsInProtection      float64
		seenAccountsInProtection  bool
		sprayedTokensByWindow     []perWindowMetric
		stepupChallengesTotal     float64
		seenStepup                bool
		powChallengesTotal        float64
		seenPow                   bool
		slowAttackSuspicionsTotal float64
		seenSlow                  bool
	)

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "#") || strings.TrimSpace(line) == "" {

			continue
		}

		m := metricLine.FindStringSubmatch(line)
		if len(m) == 0 {
			continue
		}

		name := m[1]
		labels := m[2]
		valStr := m[3]
		v, _ := strconv.ParseFloat(valStr, 64)

		switch name {
		case "security_unique_ips_per_user":
			// labels: username, window
			user := ""
			win := ""

			if labels != "" {
				for _, lm := range labelKVP.FindAllStringSubmatch(labels, -1) {
					if len(lm) == 3 {
						k, val := lm[1], lm[2]
						if k == "username" {
							user = val
						}
						if k == "window" {
							win = val
						}
					}
				}
			}

			uniqueIPsPerUser = append(uniqueIPsPerUser, perUserMetric{Username: user, Window: win, Value: v})
		case "security_account_fail_budget_used":
			user := ""
			win := ""

			if labels != "" {
				for _, lm := range labelKVP.FindAllStringSubmatch(labels, -1) {
					if len(lm) == 3 {
						k, val := lm[1], lm[2]
						if k == "username" {
							user = val
						}
						if k == "window" {
							win = val
						}
					}
				}
			}

			failBudgetUsed = append(failBudgetUsed, perUserMetric{Username: user, Window: win, Value: v})
		case "security_global_ips_per_user":
			win := ""

			if labels != "" {
				for _, lm := range labelKVP.FindAllStringSubmatch(labels, -1) {
					if len(lm) == 3 && lm[1] == "window" {
						win = lm[2]
					}
				}
			}

			globalIPsPerUser = append(globalIPsPerUser, perWindowMetric{Window: win, Value: v})
		case "security_accounts_in_protection_mode_total":
			accountsInProtection = v
			seenAccountsInProtection = true
		case "security_sprayed_password_tokens_total":
			win := ""

			if labels != "" {
				for _, lm := range labelKVP.FindAllStringSubmatch(labels, -1) {
					if len(lm) == 3 && lm[1] == "window" {
						win = lm[2]
					}
				}
			}

			sprayedTokensByWindow = append(sprayedTokensByWindow, perWindowMetric{Window: win, Value: v})
		case "security_stepup_challenges_issued_total":
			stepupChallengesTotal = v
			seenStepup = true
		case "security_pow_challenges_issued_total":
			powChallengesTotal = v
			seenPow = true
		case "security_slow_attack_suspicions_total":
			slowAttackSuspicionsTotal = v
			seenSlow = true
		}
	}

	// Build response
	res := gin.H{
		"timestamp_ms":             time.Now().UnixMilli(),
		"unique_ips_per_user":      uniqueIPsPerUser,
		"account_fail_budget_used": failBudgetUsed,
		"global_ips_per_user":      globalIPsPerUser,
		"sprayed_password_tokens":  sprayedTokensByWindow,
	}

	if seenAccountsInProtection {
		res["accounts_in_protection_mode_total"] = accountsInProtection
	}

	if seenStepup {
		res["stepup_challenges_issued_total"] = stepupChallengesTotal
	}

	if seenPow {
		res["pow_challenges_issued_total"] = powChallengesTotal
	}

	if seenSlow {
		res["slow_attack_suspicions_total"] = slowAttackSuspicionsTotal
	}

	// Audit security metrics proxy success
	action := getOperation(ctx)
	targetHost := u.Scheme + "://" + u.Host

	api.WriteAudit(ctx, h.Mongo, models.AuditLogEntry{
		Action: action,
		Target: targetHost + "/metrics",
		Details: map[string]any{
			"status":        http.StatusOK,
			"http_method":   ctx.Request.Method,
			"endpoint":      "/proxy/security/metrics",
			"endpoint_path": "/metrics",
			"query":         ctx.Request.URL.RawQuery,
		},
	})

	ctx.JSON(http.StatusOK, res)
}

// isPublicRoutableIP checks for public/routable IPv4/IPv6 (no private, loopback, link-local, doc/test)
func isPublicRoutableIP(ipStr string) bool {
	ip := net.ParseIP(strings.TrimSpace(ipStr))
	if ip == nil {
		return false
	}

	if ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalMulticast() || ip.IsLinkLocalUnicast() {
		return false
	}

	// IPv4 checks
	if ip4 := ip.To4(); ip4 != nil {
		// 10.0.0.0/8
		if ip4[0] == 10 {
			return false
		}

		// 172.16.0.0/12
		if ip4[0] == 172 && (ip4[1]&0xF0) == 16 {
			return false
		}

		// 192.168.0.0/16
		if ip4[0] == 192 && ip4[1] == 168 {
			return false
		}

		// 100.64.0.0/10 (CGNAT)
		if ip4[0] == 100 && (ip4[1]&0xC0) == 64 {
			return false
		}

		// 198.18.0.0/15 benchmarking
		if ip4[0] == 198 && (ip4[1] == 18 || ip4[1] == 19) {
			return false
		}

		// 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 documentation
		if (ip4[0] == 192 && ip4[1] == 0 && ip4[2] == 2) || (ip4[0] == 198 && ip4[1] == 51 && ip4[2] == 100) || (ip4[0] == 203 && ip4[1] == 0 && ip4[2] == 113) {
			return false
		}
	} else {
		// IPv6: private fc00::/7, link-local fe80::/10
		ls := strings.ToLower(ip.String())
		if strings.HasPrefix(ls, "fc") || strings.HasPrefix(ls, "fd") {
			return false
		}

		if strings.HasPrefix(ls, "fe80:") {
			return false
		}
	}

	return true
}

// IpapiStatus returns { enabled: boolean } depending on the presence of IPAPI_API_KEY
func (h *ProxyHandler) IpapiStatus(ctx *gin.Context) {
	enabled := os.Getenv("IPAPI_API_KEY") != ""
	ctx.JSON(http.StatusOK, gin.H{"enabled": enabled})
}

// IpapiLookupProxy proxies to ipapi.com and returns pretty JSON for UI
func (h *ProxyHandler) IpapiLookupProxy(ctx *gin.Context) {
	ip := strings.TrimSpace(ctx.Query("ip"))
	if ip == "" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Missing query param 'ip'"})

		return
	}

	if strings.Contains(ip, "/") {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "CIDR not supported, provide a single IP"})

		return
	}

	if !isPublicRoutableIP(ip) {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "IP is not public routable"})

		return
	}

	apiKey := os.Getenv("IPAPI_API_KEY")
	if apiKey == "" {
		ctx.JSON(http.StatusNotImplemented, models.ErrorResponse{Error: "IP lookup is disabled (no API key configured)"})

		return
	}

	u := &url.URL{Scheme: "https", Host: "api.ipapi.com", Path: "/api/" + ip}
	q := u.Query()
	q.Set("access_key", apiKey)
	u.RawQuery = q.Encode()

	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create request"})

		return
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Encoding", "identity")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		ctx.JSON(http.StatusBadGateway, models.ErrorResponse{Error: "Lookup failed: " + err.Error()})

		return
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Try to extract helpful error info from ipapi response body
		body, _ := io.ReadAll(resp.Body)
		msg := "ipapi returned status " + strconv.Itoa(resp.StatusCode)
		if len(body) > 0 {
			// Attempt to parse ipapi error JSON
			var em map[string]any
			if err := json.Unmarshal(body, &em); err == nil {
				if success, ok := em["success"].(bool); ok && !success {
					if e, ok := em["error"].(map[string]any); ok {
						if info, ok := e["info"].(string); ok && info != "" {
							msg = info
						} else if t, ok := e["type"].(string); ok && t != "" {
							msg = t
						}
					}
				}
				// Some variants may use a top-level "message"
				if m, ok := em["message"].(string); ok && m != "" {
					msg = m
				}
			} else {
				// Fallback: use plain text body trimmed
				bs := strings.TrimSpace(string(body))
				if bs != "" {
					msg = msg + ": " + bs
				}
			}
		}
		// For ipapi 400-level errors, propagate 400 to the client so UI can show meaningful info
		status := http.StatusBadGateway
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			status = http.StatusBadRequest
		}
		ctx.JSON(status, models.ErrorResponse{Error: msg})

		return
	}

	var raw map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		ctx.JSON(http.StatusBadGateway, models.ErrorResponse{Error: "Invalid response from ipapi"})

		return
	}

	if success, ok := raw["success"].(bool); ok && !success {
		if e, ok := raw["error"].(map[string]any); ok {
			msg := "ipapi error"
			if m, ok := e["info"].(string); ok {
				msg = m
			}

			ctx.JSON(http.StatusBadGateway, models.ErrorResponse{Error: msg})

			return
		}

		ctx.JSON(http.StatusBadGateway, models.ErrorResponse{Error: "ipapi returned an error"})

		return
	}

	type Loc struct {
		Continent      string   `json:"continent"`
		ContinentCode  string   `json:"continent_code"`
		Country        string   `json:"country"`
		CountryCode    string   `json:"country_code"`
		Region         string   `json:"region"`
		RegionCode     string   `json:"region_code"`
		City           string   `json:"city"`
		Zip            string   `json:"zip"`
		Lat            float64  `json:"lat"`
		Lon            float64  `json:"lon"`
		Capital        string   `json:"capital"`
		Languages      []string `json:"languages"`
		IsEU           bool     `json:"is_eu"`
		GeoNameID      float64  `json:"geoname_id"`
		CountryFlagURL string   `json:"country_flag"`
		FlagEmoji      string   `json:"flag_emoji"`
		Calling        string   `json:"calling_code"`
		TimeZone       string   `json:"time_zone"`
		ISP            string   `json:"isp"`
		Org            string   `json:"org"`
		Asn            string   `json:"asn"`
		Proxy          bool     `json:"proxy"`
		Hosting        bool     `json:"hosting"`
	}

	type TimeZone struct {
		ID          string  `json:"id"`
		Abbr        string  `json:"code"`
		CurrentTime string  `json:"current_time"`
		GmtOffset   float64 `json:"gmt_offset"`
		IsDST       bool    `json:"is_dst"`
	}

	type Connection struct {
		IP   string `json:"ip"`
		Type string `json:"type"`
		ISP  string `json:"isp"`
		Org  string `json:"org"`
		Asn  string `json:"asn"`
	}

	type Carrier struct {
		Name string `json:"name"`
		MCC  string `json:"mcc"`
		MNC  string `json:"mnc"`
	}

	getS := func(m map[string]any, k string) string {
		if v, ok := m[k].(string); ok {
			return v
		}

		return ""
	}

	getF := func(m map[string]any, k string) float64 {
		if v, ok := m[k].(float64); ok {
			return v
		}

		return 0
	}

	getB := func(m map[string]any, k string) bool {
		if v, ok := m[k].(bool); ok {
			return v
		}

		return false
	}

	loc := Loc{
		Continent:     getS(raw, "continent_name"),
		ContinentCode: getS(raw, "continent_code"),
		Country:       getS(raw, "country_name"),
		CountryCode:   getS(raw, "country_code"),
		Region:        getS(raw, "region_name"),
		RegionCode:    getS(raw, "region_code"),
		City:          getS(raw, "city"),
		Zip:           getS(raw, "zip"),
		Lat:           getF(raw, "latitude"),
		Lon:           getF(raw, "longitude"),
	}

	if m, ok := raw["location"].(map[string]any); ok {
		loc.Capital = getS(m, "capital")
		// languages can be array of objects or string; collect readable names/codes
		if arr, ok := m["languages"].([]any); ok {
			langs := make([]string, 0, len(arr))
			for _, it := range arr {
				if mm, ok := it.(map[string]any); ok {
					name := getS(mm, "name")
					if name == "" {
						name = getS(mm, "native")
					}

					if name == "" {
						name = getS(mm, "code")
					}

					if name != "" {
						langs = append(langs, name)
					}
				}
			}

			loc.Languages = langs
		}

		loc.IsEU = getB(m, "is_eu")
		// geoname_id might be number or string; try both
		if v, ok := m["geoname_id"].(float64); ok {
			loc.GeoNameID = v
		} else if s, ok := m["geoname_id"].(string); ok && s != "" {
			if fv, err := strconv.ParseFloat(s, 64); err == nil {
				loc.GeoNameID = fv
			}
		}

		loc.CountryFlagURL = getS(m, "country_flag")
		loc.FlagEmoji = getS(m, "country_flag_emoji")
		loc.Calling = getS(m, "calling_code")
		loc.Proxy = getB(m, "is_proxy")
		loc.Hosting = getB(m, "is_hosting")
	}

	var tzObj *TimeZone
	if tz, ok := raw["time_zone"].(map[string]any); ok {
		loc.TimeZone = getS(tz, "id")
		tzObj = &TimeZone{
			ID:          getS(tz, "id"),
			Abbr:        getS(tz, "code"),
			CurrentTime: getS(tz, "current_time"),
			GmtOffset:   getF(tz, "gmt_offset"),
			IsDST:       getB(tz, "is_dst"),
		}
	}

	var connObj *Connection
	if c, ok := raw["connection"].(map[string]any); ok {
		loc.ISP = getS(c, "isp")
		loc.Org = getS(c, "org")
		asn := ""

		if v, ok := c["asn"].(float64); ok {
			asn = "AS" + fmt.Sprintf("%.0f", v)
		} else {
			asn = getS(c, "asn")
		}

		loc.Asn = asn

		// Use the explicit connection_type provided by ipapi (no fallback/derivation)
		connType := getS(c, "connection_type")

		connObj = &Connection{
			IP:   getS(c, "ip"),
			Type: connType,
			ISP:  getS(c, "isp"),
			Org:  getS(c, "org"),
			Asn:  asn,
		}
	}

	var carrierObj *Carrier
	if car, ok := raw["carrier"].(map[string]any); ok {
		carrierObj = &Carrier{Name: getS(car, "name"), MCC: getS(car, "mcc"), MNC: getS(car, "mnc")}
	}

	res := gin.H{
		"ip":              getS(raw, "ip"),
		"type":            getS(raw, "type"),
		"hostname":        getS(raw, "hostname"),
		"location":        loc,
		"ip_routing_type": getS(raw, "ip_routing_type"),
	}

	if tzObj != nil {
		res["time_zone"] = tzObj
	}

	if connObj != nil {
		res["connection"] = connObj
		// Also expose connection_type at top-level for convenience (aligns with Lua usage ip_info.connection_type)
		res["connection_type"] = connObj.Type
	}

	if carrierObj != nil {
		res["carrier"] = carrierObj
	}

	api.WriteAudit(ctx, h.Mongo, models.AuditLogEntry{
		Action: "ipapi.lookup",
		Target: "ipapi.com",
		Details: map[string]any{
			"status":    http.StatusOK,
			"endpoint":  "/proxy/ipapi/lookup",
			"client_ip": ip,
		},
	})

	ctx.JSON(http.StatusOK, res)
}

// writeAudit is a small helper that respects per-endpoint audit suppression
func (h *ProxyHandler) writeAudit(ctx *gin.Context, config ProxyConfig, entry models.AuditLogEntry) {
	if config.SkipAudit {
		return
	}

	api.WriteAudit(ctx, h.Mongo, entry)
}
