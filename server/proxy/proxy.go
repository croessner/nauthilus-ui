package proxy

import (
	"bufio"
	"compress/gzip"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/models"
	"nauthilus-ui/server/utils"
)

// ProxyHandler handles proxy requests to external services
type ProxyHandler struct{}

// ProxyConfig holds configuration for a proxy request
type ProxyConfig struct {
	TargetURL       string
	EndpointPath    string
	Operation       string
	RequiresAuth    bool
	ContentType     string
	LogEndpoint     string
	UseReverseProxy bool
}

// NewProxyHandler creates a new ProxyHandler
func NewProxyHandler() *ProxyHandler {
	return &ProxyHandler{}
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

			// Add authentication headers if required
			if config.RequiresAuth {
				authType, authValue := getAuthParams(ctx)
				utils.AddAuthorizationHeader(req, authType, authValue)
			}
		}

		// Handle errors
		proxy.ErrorHandler = func(rw http.ResponseWriter, req *http.Request, err error) {
			ctx.JSON(http.StatusBadGateway, models.ErrorResponse{
				Error: "Failed to connect to backend server: " + err.Error(),
			})
		}

		// Serve the request
		proxy.ServeHTTP(ctx.Writer, ctx.Request)

		return
	}

	// Create the proxy request
	req, err := http.NewRequest(ctx.Request.Method, target.String(), ctx.Request.Body)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create proxy request"})

		return
	}

	// Copy headers from the original request
	copyHeaders(req.Header, ctx.Request.Header)

	// Add authentication headers if required
	if config.RequiresAuth {
		authType, authValue := getAuthParams(ctx)
		utils.AddAuthorizationHeader(req, authType, authValue)
	}

	// Set content type if specified
	if config.ContentType != "" {
		req.Header.Set("Content-Type", config.ContentType)
	}

	// Send the proxy request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
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

	// Set the status code
	ctx.Writer.WriteHeader(resp.StatusCode)

	// Copy the response body only for non-HEAD requests
	if ctx.Request.Method != http.MethodHead {
		_, _ = io.Copy(ctx.Writer, resp.Body)
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

	router.GET("/proxy/bruteforce/flush", h.BruteforceFlushProxy)
	router.POST("/proxy/bruteforce/flush", h.BruteforceFlushProxy)
	router.DELETE("/proxy/bruteforce/flush", h.BruteforceFlushProxy)

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
}

// PingProxy handles the /proxy/ping endpoint
func (h *ProxyHandler) PingProxy(ctx *gin.Context) {
	config := ProxyConfig{
		EndpointPath: "/ping",
		LogEndpoint:  "/proxy/ping",
		RequiresAuth: false,
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

	ctx.JSON(http.StatusOK, res)
}
