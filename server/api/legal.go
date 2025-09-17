package api

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

// LegalHandler handles legal pages requests
type LegalHandler struct {
	MongoDB *db.MongoDB
}

// NewLegalHandler creates a new LegalHandler
func NewLegalHandler(mongoDB *db.MongoDB) *LegalHandler {
	return &LegalHandler{MongoDB: mongoDB}
}

// RegisterRoutes registers the legal routes on a plain engine (unprotected)
// Prefer RegisterGroupRoutes to ensure middleware protection.
func (h *LegalHandler) RegisterRoutes(router *gin.Engine) {
	// Group under /api/legal
	router.GET("/api/legal", h.GetAll)
	router.GET("/api/legal/:key", h.GetOne)
	router.PUT("/api/legal/:key", h.Update)
}

// RegisterGroupRoutes registers the legal routes within a router group (e.g., protected /api group)
func (h *LegalHandler) RegisterGroupRoutes(group *gin.RouterGroup) {
	group.GET("/legal", h.GetAll)
	group.GET("/legal/:key", h.GetOne)
	group.PUT("/legal/:key", h.Update)
}

// GetAll returns all legal pages
func (h *LegalHandler) GetAll(ctx *gin.Context) {
	// If not connected to Mongo, return defaults
	if !h.MongoDB.IsConnected {
		resp := models.LegalResponse{Pages: []models.LegalPage{
			{Key: "imprint", Title: "Imprint", ContentMD: "", UpdatedAt: "", UpdatedBy: ""},
			{Key: "privacy", Title: "Privacy Policy", ContentMD: "", UpdatedAt: "", UpdatedBy: ""},
		}}

		ctx.JSON(http.StatusOK, resp)

		return
	}

	// Load from DB
	cur, err := h.MongoDB.LegalColl.Find(ctx.Request.Context(), bson.M{})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to load legal pages"})

		return
	}

	defer func(cur *mongo.Cursor, ctx context.Context) {
		_ = cur.Close(ctx)
	}(cur, ctx.Request.Context())

	var pages []models.LegalPage

	for cur.Next(ctx.Request.Context()) {
		var page models.LegalPage
		if err := cur.Decode(&page); err == nil {
			pages = append(pages, page)
		}
	}

	ctx.JSON(http.StatusOK, models.LegalResponse{Pages: pages})
}

// GetOne returns a single legal page by key
func (h *LegalHandler) GetOne(ctx *gin.Context) {
	key := ctx.Param("key")
	if key != "imprint" && key != "privacy" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid key"})

		return
	}

	if !h.MongoDB.IsConnected {
		// Fallback defaults
		title := map[string]string{"imprint": "Imprint", "privacy": "Privacy Policy"}[key]
		ctx.JSON(http.StatusOK, models.LegalPage{Key: key, Title: title})

		return
	}

	var page models.LegalPage
	err := h.MongoDB.LegalColl.FindOne(ctx.Request.Context(), bson.M{"key": key}).Decode(&page)
	if err != nil {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Legal page not found"})

		return
	}

	ctx.JSON(http.StatusOK, page)
}

// Update updates a legal page (admin only)
func (h *LegalHandler) Update(ctx *gin.Context) {
	key := ctx.Param("key")
	if key != "imprint" && key != "privacy" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid key"})

		return
	}

	// Check roles from context
	rolesVal, _ := ctx.Get("roles")
	isAdmin := false
	if roles, ok := rolesVal.([]string); ok {
		for _, r := range roles {
			if r == "admin" {
				isAdmin = true

				break
			}
		}
	}

	if !isAdmin {
		slog.Warn("Unauthorized attempt to update legal page")
		ctx.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Admin role required"})

		return
	}

	var input struct {
		Title     string `json:"title"`
		ContentMD string `json:"contentMd"`
	}

	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	updatedBy, _ := ctx.Get("username")
	if updatedBy == nil {
		updatedBy = "admin"
	}

	update := bson.M{
		"$set": bson.M{
			"title":     input.Title,
			"contentMd": input.ContentMD,
			"updatedAt": time.Now().Format(time.RFC3339),
			"updatedBy": updatedBy,
		},
	}

	// If DB disconnected, just echo back
	if !h.MongoDB.IsConnected {
		ctx.JSON(http.StatusOK, models.LegalPage{Key: key, Title: input.Title, ContentMD: input.ContentMD})

		return
	}

	res := h.MongoDB.LegalColl.FindOneAndUpdate(
		ctx.Request.Context(),
		bson.M{"key": key},
		update,
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)

	var out models.LegalPage
	if err := res.Decode(&out); err != nil {
		// If not found, upsert by updating with upsert option
		_, err2 := h.MongoDB.LegalColl.UpdateOne(
			ctx.Request.Context(),
			bson.M{"key": key},
			update,
			options.Update().SetUpsert(true),
		)

		if err2 != nil {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to save legal page"})

			return
		}

		// Return the new state
		out = models.LegalPage{Key: key, Title: input.Title, ContentMD: input.ContentMD}
	}

	// Audit legal page update
	WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
		Action: "legal.update",
		Target: key,
		Details: map[string]interface{}{
			"titleLength":   len(out.Title),
			"contentLength": len(out.ContentMD),
		},
	})

	ctx.JSON(http.StatusOK, out)
}
