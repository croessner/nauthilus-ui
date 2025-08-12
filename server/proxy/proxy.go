package proxy

import (
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

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

// getOperation extracts the operation from the request
func getOperation(ctx *gin.Context) string {
	// Get operation parameter from query parameter or header
	operation := ctx.GetHeader("x-operation")
	if operation == "" {
		operation = ctx.Query("operation")
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

// handleProxyRequest handles the common proxy flow
func (h *ProxyHandler) handleProxyRequest(ctx *gin.Context, config ProxyConfig) {
	// Set CORS headers for non-OPTIONS requests
	origin := ctx.Request.Header.Get("Origin")
	if origin == "" {
		// Default to localhost:3000 for development
		origin = "http://localhost:3000"
	}

	ctx.Header("Access-Control-Allow-Origin", origin)
	ctx.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	ctx.Header("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, x-target-url, x-endpoint-path, x-operation, x-auth-type, x-auth-value")
	ctx.Header("Access-Control-Allow-Credentials", "true")

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

	// Log the request
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

	// If operation is provided, append it as a query parameter
	if config.Operation != "" {
		// Check if the endpoint path already has query parameters
		if target.RawQuery != "" {
			target.RawQuery += "&operation=" + config.Operation
		} else {
			target.RawQuery = "operation=" + config.Operation
		}
	}

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

	// Set the status code
	ctx.Writer.WriteHeader(resp.StatusCode)

	// Copy the response body
	_, _ = io.Copy(ctx.Writer, resp.Body)
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
		ctx.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		ctx.Header("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, x-target-url, x-endpoint-path, x-operation, x-auth-type, x-auth-value")
		ctx.Header("Access-Control-Allow-Credentials", "true")
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
