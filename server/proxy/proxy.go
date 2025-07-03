package proxy

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"

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
func getTargetURL(c *gin.Context) (string, int, string, bool) {
	// Get target URL from query parameter or header
	targetURL := c.GetHeader("x-target-url")
	if targetURL == "" {
		targetURL = c.Query("url")
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
func getEndpointPath(c *gin.Context) (string, int, string, bool) {
	// Get endpoint path from query parameter or header
	endpointPath := c.GetHeader("x-endpoint-path")
	if endpointPath == "" {
		endpointPath = c.Query("endpoint_path")
	}

	if endpointPath == "" {
		return "", http.StatusBadRequest, "Endpoint path is required", false
	}

	return endpointPath, 0, "", true
}

// getOperation extracts the operation from the request
func getOperation(c *gin.Context) string {
	// Get operation parameter from query parameter or header
	operation := c.GetHeader("x-operation")
	if operation == "" {
		operation = c.Query("operation")
	}

	return operation
}

// getAuthParams extracts authentication parameters from the request
func getAuthParams(c *gin.Context) (string, string) {
	// Get auth parameters from headers or query parameters
	authType := c.GetHeader("x-auth-type")
	authValue := c.GetHeader("x-auth-value")

	// If not in headers, try query parameters
	if authType == "" || authValue == "" {
		authType, authValue = utils.GetAuthorizationFromQuery(c.Request)
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
func (h *ProxyHandler) handleProxyRequest(c *gin.Context, config ProxyConfig) {
	// Get and validate target URL if not provided
	if config.TargetURL == "" {
		var statusCode int
		var errMsg string
		var ok bool

		config.TargetURL, statusCode, errMsg, ok = getTargetURL(c)
		if !ok {
			c.JSON(statusCode, models.ErrorResponse{Error: errMsg})

			return
		}
	}

	// Log the request
	if config.EndpointPath == "" {
		// Simple endpoint with a fixed path
		slog.Info("Handling proxy request", "endpoint", config.LogEndpoint, "method", c.Request.Method, "target", config.TargetURL)
	} else {
		// For endpoints with dynamic path
		slog.Info("Handling proxy request", "endpoint", config.LogEndpoint, "method", c.Request.Method, "target", config.TargetURL, "endpoint_path", config.EndpointPath)
	}

	// Parse the target URL
	target, err := url.Parse(config.TargetURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid target URL"})

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
				authType, authValue := getAuthParams(c)
				utils.AddAuthorizationHeader(req, authType, authValue)
			}
		}

		// Handle errors
		proxy.ErrorHandler = func(rw http.ResponseWriter, req *http.Request, err error) {
			c.JSON(http.StatusBadGateway, models.ErrorResponse{
				Error: "Failed to connect to backend server: " + err.Error(),
			})
		}

		// Serve the request
		proxy.ServeHTTP(c.Writer, c.Request)

		return
	}

	// Create the proxy request
	req, err := http.NewRequest(c.Request.Method, target.String(), c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create proxy request"})

		return
	}

	// Copy headers from the original request
	copyHeaders(req.Header, c.Request.Header)

	// Add authentication headers if required
	if config.RequiresAuth {
		authType, authValue := getAuthParams(c)
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
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to connect to backend server: " + err.Error()})

		return
	}

	defer resp.Body.Close()

	// Copy the response headers
	copyHeaders(c.Writer.Header(), resp.Header)

	// Set the status code
	c.Writer.WriteHeader(resp.StatusCode)

	// Copy the response body
	io.Copy(c.Writer, resp.Body)
}

// RegisterRoutes registers the proxy routes
func (h *ProxyHandler) RegisterRoutes(router *gin.Engine) {
	router.Any("/proxy/ping", h.PingProxy)
	router.Any("/proxy/jwt-token", h.JWTTokenProxy)
	router.Any("/proxy/bruteforce/list", h.BruteforceListProxy)
	router.Any("/proxy/cache/flush", h.CacheFlushProxy)
	router.Any("/proxy/bruteforce/flush", h.BruteforceFlushProxy)
	router.Any("/proxy/config/load", h.ConfigLoadProxy)

	// Hook proxy routes
	router.Any("/proxy/hooks/distributed-brute-force-admin", h.DistributedBruteForceAdminProxy)
	router.Any("/proxy/hooks/distributed-brute-force-test", h.DistributedBruteForceTestProxy)
	router.Any("/proxy/hooks/learning-mode", h.LearningModeProxy)
	router.Any("/proxy/hooks/neural-feedback", h.NeuralFeedbackProxy)
	router.Any("/proxy/hooks/train-neural-network", h.TrainNeuralNetworkProxy)
}

// PingProxy handles the /proxy/ping endpoint
func (h *ProxyHandler) PingProxy(c *gin.Context) {
	config := ProxyConfig{
		EndpointPath: "/ping",
		LogEndpoint:  "/proxy/ping",
		RequiresAuth: false,
	}

	h.handleProxyRequest(c, config)
}

// JWTTokenProxy handles the /proxy/jwt-token endpoint
func (h *ProxyHandler) JWTTokenProxy(c *gin.Context) {
	config := ProxyConfig{
		EndpointPath: "/api/v1/jwt/token",
		LogEndpoint:  "/proxy/jwt-token",
		RequiresAuth: false,
		ContentType:  "application/json",
	}

	h.handleProxyRequest(c, config)
}

// BruteforceListProxy handles the /proxy/bruteforce/list endpoint
func (h *ProxyHandler) BruteforceListProxy(c *gin.Context) {
	config := ProxyConfig{
		EndpointPath: "/api/v1/bruteforce/list",
		LogEndpoint:  "/proxy/bruteforce/list",
		RequiresAuth: true,
	}

	h.handleProxyRequest(c, config)
}

// CacheFlushProxy handles the /proxy/cache/flush endpoint
func (h *ProxyHandler) CacheFlushProxy(c *gin.Context) {
	config := ProxyConfig{
		EndpointPath: "/api/v1/cache/flush",
		LogEndpoint:  "/proxy/cache/flush",
		RequiresAuth: true,
		ContentType:  "application/json",
	}

	h.handleProxyRequest(c, config)
}

// BruteforceFlushProxy handles the /proxy/bruteforce/flush endpoint
func (h *ProxyHandler) BruteforceFlushProxy(c *gin.Context) {
	config := ProxyConfig{
		EndpointPath: "/api/v1/bruteforce/flush",
		LogEndpoint:  "/proxy/bruteforce/flush",
		RequiresAuth: true,
		ContentType:  "application/json",
	}

	h.handleProxyRequest(c, config)
}

// ConfigLoadProxy handles the /proxy/config/load endpoint
func (h *ProxyHandler) ConfigLoadProxy(c *gin.Context) {
	config := ProxyConfig{
		EndpointPath:    "/api/v1/config/load",
		LogEndpoint:     "/proxy/config/load",
		RequiresAuth:    true,
		UseReverseProxy: true,
	}

	h.handleProxyRequest(c, config)
}

// DistributedBruteForceAdminProxy handles the /proxy/hooks/distributed-brute-force-admin endpoint
func (h *ProxyHandler) DistributedBruteForceAdminProxy(c *gin.Context) {
	// Get endpoint path
	endpointPath, statusCode, errMsg, ok := getEndpointPath(c)
	if !ok {
		c.JSON(statusCode, models.ErrorResponse{Error: errMsg})

		return
	}

	config := ProxyConfig{
		EndpointPath: endpointPath,
		LogEndpoint:  "/proxy/hooks/distributed-brute-force-admin",
		RequiresAuth: true,
		ContentType:  "application/json",
		Operation:    getOperation(c),
	}

	h.handleProxyRequest(c, config)
}

// DistributedBruteForceTestProxy handles the /proxy/hooks/distributed-brute-force-test endpoint
func (h *ProxyHandler) DistributedBruteForceTestProxy(c *gin.Context) {
	// Get endpoint path
	endpointPath, statusCode, errMsg, ok := getEndpointPath(c)
	if !ok {
		c.JSON(statusCode, models.ErrorResponse{Error: errMsg})

		return
	}

	config := ProxyConfig{
		EndpointPath: endpointPath,
		LogEndpoint:  "/proxy/hooks/distributed-brute-force-test",
		RequiresAuth: true,
		ContentType:  "application/json",
		Operation:    getOperation(c),
	}

	h.handleProxyRequest(c, config)
}

// LearningModeProxy handles the /proxy/hooks/learning-mode endpoint
func (h *ProxyHandler) LearningModeProxy(c *gin.Context) {
	// Get endpoint path
	endpointPath, statusCode, errMsg, ok := getEndpointPath(c)
	if !ok {
		c.JSON(statusCode, models.ErrorResponse{Error: errMsg})

		return
	}

	// Create a custom handler for learning-mode that always uses GET method
	// Parse the target URL
	targetURL, statusCode, errMsg, ok := getTargetURL(c)
	if !ok {
		c.JSON(statusCode, models.ErrorResponse{Error: errMsg})

		return
	}

	// Log the request
	slog.Info("Handling proxy request", "endpoint", "/proxy/hooks/learning-mode", "method", "GET", "target", targetURL, "endpoint_path", endpointPath)

	// Parse the target URL
	target, err := url.Parse(targetURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid target URL"})

		return
	}

	// Set the path
	target.Path = endpointPath

	// If operation is provided, append it as a query parameter
	operation := getOperation(c)
	if operation != "" {
		// Check if the endpoint path already has query parameters
		if target.RawQuery != "" {
			target.RawQuery += "&operation=" + operation
		} else {
			target.RawQuery = "operation=" + operation
		}
	}

	// Create the proxy request - always use GET method for learning-mode
	req, err := http.NewRequest("GET", target.String(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create proxy request"})

		return
	}

	// Copy headers from the original request
	copyHeaders(req.Header, c.Request.Header)

	// Add authentication headers
	authType, authValue := getAuthParams(c)
	utils.AddAuthorizationHeader(req, authType, authValue)

	// Set content type
	req.Header.Set("Content-Type", "application/json")

	// Send the proxy request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to connect to backend server: " + err.Error()})

		return
	}

	defer resp.Body.Close()

	// Copy the response headers
	copyHeaders(c.Writer.Header(), resp.Header)

	// Set the status code
	c.Writer.WriteHeader(resp.StatusCode)

	// Copy the response body
	io.Copy(c.Writer, resp.Body)
}

// NeuralFeedbackProxy handles the /proxy/hooks/neural-feedback endpoint
func (h *ProxyHandler) NeuralFeedbackProxy(c *gin.Context) {
	// Get endpoint path
	endpointPath, statusCode, errMsg, ok := getEndpointPath(c)
	if !ok {
		c.JSON(statusCode, models.ErrorResponse{Error: errMsg})

		return
	}

	config := ProxyConfig{
		EndpointPath: endpointPath,
		LogEndpoint:  "/proxy/hooks/neural-feedback",
		RequiresAuth: true,
		ContentType:  "application/json",
		Operation:    getOperation(c),
	}

	h.handleProxyRequest(c, config)
}

// TrainNeuralNetworkProxy handles the /proxy/hooks/train-neural-network endpoint
func (h *ProxyHandler) TrainNeuralNetworkProxy(c *gin.Context) {
	// Get endpoint path
	endpointPath, statusCode, errMsg, ok := getEndpointPath(c)
	if !ok {
		c.JSON(statusCode, models.ErrorResponse{Error: errMsg})

		return
	}

	config := ProxyConfig{
		EndpointPath: endpointPath,
		LogEndpoint:  "/proxy/hooks/train-neural-network",
		RequiresAuth: true,
		ContentType:  "application/json",
		Operation:    c.Query("operation"), // This endpoint only uses query parameters
	}

	h.handleProxyRequest(c, config)
}
