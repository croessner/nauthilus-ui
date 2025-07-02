package api

import (
	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HealthHandler handles health check requests
type HealthHandler struct {
	MongoDB *db.MongoDB
}

// NewHealthHandler creates a new HealthHandler
func NewHealthHandler(mongoDB *db.MongoDB) *HealthHandler {
	return &HealthHandler{
		MongoDB: mongoDB,
	}
}

// RegisterRoutes registers the health check routes
func (h *HealthHandler) RegisterRoutes(router *gin.Engine) {
	router.GET("/api/health/mongodb", h.MongoDBHealth)
}

// MongoDBHealth handles the MongoDB health check endpoint
func (h *HealthHandler) MongoDBHealth(c *gin.Context) {
	if h.MongoDB.IsConnected {
		c.JSON(http.StatusOK, models.HealthResponse{
			Status: "connected",
		})
	} else {
		// Try to reconnect if not connected
		go h.MongoDB.RetryConnection(c.Request.Context(), true)
		c.JSON(http.StatusOK, models.HealthResponse{
			Status:  "disconnected",
			Message: "Reconnection attempt triggered",
		})
	}
}
