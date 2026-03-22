package middleware

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/utils"
)

// Logger returns a Gin middleware that logs requests using slog in a consistent format
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// Process request
		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		size := c.Writer.Size()
		clientIP := c.ClientIP()
		method := c.Request.Method
		path := c.Request.URL.Path

		path = utils.RedactPathWithQuery(path, c.Request.URL.RawQuery)

		userAgent := c.Request.UserAgent()
		referer := utils.RedactURLString(c.Request.Referer())
		errs := c.Errors.ByType(gin.ErrorTypeAny).String()

		attrs := []any{
			"status", status,
			"latency", latency.String(),
			"ip", clientIP,
			"method", method,
			"path", path,
			"size", size,
		}

		if userAgent != "" {
			attrs = append(attrs, "user_agent", userAgent)
		}

		if referer != "" {
			attrs = append(attrs, "referer", referer)
		}

		if errs != "" {
			attrs = append(attrs, "error", errs)
		}

		// Choose log level based on status code
		switch {
		case status >= 500:
			slog.Error("http_request", attrs...)
		case status >= 400:
			slog.Warn("http_request", attrs...)
		default:
			slog.Info("http_request", attrs...)
		}
	}
}
