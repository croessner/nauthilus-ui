package proxy

import (
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/models"
	"nauthilus-ui/server/utils"
)

// ProxyHandler handles proxy requests to external services
type ProxyHandler struct{}

// NewProxyHandler creates a new ProxyHandler
func NewProxyHandler() *ProxyHandler {
	return &ProxyHandler{}
}

// RegisterRoutes registers the proxy routes
func (h *ProxyHandler) RegisterRoutes(router *gin.Engine) {
	router.Any("/proxy/ping", h.PingProxy)
	router.Any("/proxy/jwt-token", h.JWTTokenProxy)
	router.Any("/proxy/bruteforce/list", h.BruteforceListProxy)
	router.Any("/proxy/cache/flush", h.CacheFlushProxy)
	router.Any("/proxy/bruteforce/flush", h.BruteforceFlushProxy)
	router.Any("/proxy/config/load", h.ConfigLoadProxy)
}

// PingProxy handles the /proxy/ping endpoint
func (h *ProxyHandler) PingProxy(c *gin.Context) {
	targetURL := c.Query("url")
	if targetURL == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Target URL is required"})

		return
	}

	// Create the target URL with the /ping path
	target, err := url.Parse(targetURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid target URL"})

		return
	}

	target.Path = "/ping"

	// Create the proxy request
	req, err := http.NewRequest(c.Request.Method, target.String(), c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create proxy request"})

		return
	}

	// Copy headers from the original request
	for key, values := range c.Request.Header {
		for _, value := range values {
			req.Header.Add(key, value)
		}
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
	for key, values := range resp.Header {
		for _, value := range values {
			c.Writer.Header().Add(key, value)
		}
	}

	// Set the status code
	c.Writer.WriteHeader(resp.StatusCode)

	// Copy the response body
	io.Copy(c.Writer, resp.Body)
}

// JWTTokenProxy handles the /proxy/jwt-token endpoint
func (h *ProxyHandler) JWTTokenProxy(c *gin.Context) {
	targetURL := c.Query("url")
	if targetURL == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Target URL is required"})

		return
	}

	// Create the target URL with the /api/v1/jwt/token path
	target, err := url.Parse(targetURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid target URL"})

		return
	}
	target.Path = "/api/v1/jwt/token"

	// Create the proxy request
	req, err := http.NewRequest(c.Request.Method, target.String(), c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create proxy request"})

		return
	}

	// Copy headers from the original request
	for key, values := range c.Request.Header {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}

	// Set content type for POST requests
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
	for key, values := range resp.Header {
		for _, value := range values {
			c.Writer.Header().Add(key, value)
		}
	}

	// Set the status code
	c.Writer.WriteHeader(resp.StatusCode)

	// Copy the response body
	io.Copy(c.Writer, resp.Body)
}

// BruteforceListProxy handles the /proxy/bruteforce/list endpoint
func (h *ProxyHandler) BruteforceListProxy(c *gin.Context) {
	targetURL := c.Query("url")
	if targetURL == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Target URL is required"})

		return
	}

	// Create the target URL with the /api/v1/bruteforce/list path
	target, err := url.Parse(targetURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid target URL"})

		return
	}
	target.Path = "/api/v1/bruteforce/list"

	// Create the proxy request
	req, err := http.NewRequest(c.Request.Method, target.String(), c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create proxy request"})

		return
	}

	// Copy headers from the original request
	for key, values := range c.Request.Header {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}

	// Add authentication headers if provided in the request
	authType, authValue := utils.GetAuthorizationFromQuery(c.Request)
	utils.AddAuthorizationHeader(req, authType, authValue)

	// Send the proxy request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to connect to backend server: " + err.Error()})

		return
	}

	defer resp.Body.Close()

	// Copy the response headers
	for key, values := range resp.Header {
		for _, value := range values {
			c.Writer.Header().Add(key, value)
		}
	}

	// Set the status code
	c.Writer.WriteHeader(resp.StatusCode)

	// Copy the response body
	io.Copy(c.Writer, resp.Body)
}

// CacheFlushProxy handles the /proxy/cache/flush endpoint
func (h *ProxyHandler) CacheFlushProxy(c *gin.Context) {
	targetURL := c.Query("url")
	if targetURL == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Target URL is required"})

		return
	}

	// Create the target URL with the /api/v1/cache/flush path
	target, err := url.Parse(targetURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid target URL"})

		return
	}

	target.Path = "/api/v1/cache/flush"

	// Create the proxy request
	req, err := http.NewRequest(c.Request.Method, target.String(), c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create proxy request"})

		return
	}

	// Copy headers from the original request
	for key, values := range c.Request.Header {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}

	// Add authentication headers if provided in the request
	authType, authValue := utils.GetAuthorizationFromQuery(c.Request)
	utils.AddAuthorizationHeader(req, authType, authValue)

	// Set content type for POST requests
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
	for key, values := range resp.Header {
		for _, value := range values {
			c.Writer.Header().Add(key, value)
		}
	}

	// Set the status code
	c.Writer.WriteHeader(resp.StatusCode)

	// Copy the response body
	io.Copy(c.Writer, resp.Body)
}

// BruteforceFlushProxy handles the /proxy/bruteforce/flush endpoint
func (h *ProxyHandler) BruteforceFlushProxy(c *gin.Context) {
	targetURL := c.Query("url")
	if targetURL == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Target URL is required"})

		return
	}

	// Create the target URL with the /api/v1/bruteforce/flush path
	target, err := url.Parse(targetURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid target URL"})

		return
	}
	target.Path = "/api/v1/bruteforce/flush"

	// Create the proxy request
	req, err := http.NewRequest(c.Request.Method, target.String(), c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create proxy request"})

		return
	}

	// Copy headers from the original request
	for key, values := range c.Request.Header {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}

	// Add authentication headers if provided in the request
	authType, authValue := utils.GetAuthorizationFromQuery(c.Request)
	utils.AddAuthorizationHeader(req, authType, authValue)

	// Set content type for POST requests
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
	for key, values := range resp.Header {
		for _, value := range values {
			c.Writer.Header().Add(key, value)
		}
	}

	// Set the status code
	c.Writer.WriteHeader(resp.StatusCode)

	// Copy the response body
	io.Copy(c.Writer, resp.Body)
}

// ConfigLoadProxy handles the /proxy/config/load endpoint
func (h *ProxyHandler) ConfigLoadProxy(c *gin.Context) {
	targetURL := c.Query("url")
	if targetURL == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Target URL is required"})

		return
	}

	// Create the target URL with the /api/v1/config/load path
	target, err := url.Parse(targetURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid target URL"})

		return
	}

	target.Path = "/api/v1/config/load"

	// Create a reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(target)

	// Modify the request
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.URL.Path = "/api/v1/config/load"

		// Add authentication headers if provided in the request
		authType, authValue := utils.GetAuthorizationFromQuery(c.Request)
		utils.AddAuthorizationHeader(req, authType, authValue)
	}

	// Handle errors
	proxy.ErrorHandler = func(rw http.ResponseWriter, req *http.Request, err error) {
		c.JSON(http.StatusBadGateway, models.ErrorResponse{
			Error: "Failed to connect to backend server: " + err.Error(),
		})
	}

	// Serve the request
	proxy.ServeHTTP(c.Writer, c.Request)
}
