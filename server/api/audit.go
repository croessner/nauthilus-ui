package api

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"nauthilus-ui/server/audit"
	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
	"nauthilus-ui/server/requestmeta"
)

// AuditHandler provides endpoints for reading audit logs (admin-only)
type AuditHandler struct {
	MongoDB *db.MongoDB
}

func NewAuditHandler(mongoDB *db.MongoDB) *AuditHandler {
	return &AuditHandler{MongoDB: mongoDB}
}

// RegisterGroupRoutes registers routes in a protected apiGroup.
func (h *AuditHandler) RegisterGroupRoutes(apiGroup *gin.RouterGroup) {
	apiGroup.GET("/audit", h.requireAdmin(), h.List)
	apiGroup.GET("/audit/meta", h.requireAdmin(), h.Meta)
	apiGroup.GET("/audit/export", h.requireAdmin(), h.Export)
}

// requireAdmin ensures only admins can access the endpoint
func (h *AuditHandler) requireAdmin() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		rolesAny, exists := ctx.Get("roles")
		if !exists {
			ctx.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Admin role required"})
			ctx.Abort()

			return
		}

		isAdmin := false
		if roles, ok := rolesAny.([]string); ok {
			for _, r := range roles {
				if r == "admin" {
					isAdmin = true
					break
				}
			}
		}

		if !isAdmin {
			ctx.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Admin role required"})
			ctx.Abort()

			return
		}

		ctx.Next()
	}
}

// List returns audit log entries with basic pagination and filtering
func (h *AuditHandler) List(ctx *gin.Context) {
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	// Filters
	filter := bson.M{}

	if actor := ctx.Query("actor"); actor != "" {
		filter["actor"] = actor
	}

	if action := ctx.Query("action"); action != "" {
		filter["action"] = action
	}

	if target := ctx.Query("target"); target != "" {
		filter["target"] = target
	}

	// Pagination
	limit := int64(50)
	if v := ctx.Query("limit"); v != "" {
		if parsed, err := parseInt64(v); err == nil && parsed > 0 && parsed <= 500 {
			limit = parsed
		}
	}

	offset := int64(0)
	if v := ctx.Query("offset"); v != "" {
		if parsed, err := parseInt64(v); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	coll := h.MongoDB.GetAuditCollection()
	total, _ := coll.CountDocuments(ctx.Request.Context(), filter)

	cur, err := coll.Find(ctx.Request.Context(), filter, options.Find().SetSort(bson.D{{Key: "ts", Value: -1}}).SetLimit(limit).SetSkip(offset))
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch audit logs"})

		return
	}

	defer cur.Close(ctx.Request.Context())

	var entries []models.AuditLogEntry

	for cur.Next(ctx.Request.Context()) {
		var e models.AuditLogEntry
		if err := cur.Decode(&e); err == nil {
			entries = append(entries, e)
		}
	}

	ctx.JSON(http.StatusOK, models.AuditLogResponse{Items: entries, Total: total})
}

// Meta returns distinct values for actor, action, and target to support dropdowns/autocomplete
func (h *AuditHandler) Meta(ctx *gin.Context) {
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	coll := h.MongoDB.GetAuditCollection()
	toStrings := func(vals []interface{}) []string {
		out := make([]string, 0, len(vals))
		for _, v := range vals {
			if s, ok := v.(string); ok && s != "" {
				out = append(out, s)
			}
		}

		sort.Strings(out)

		return out
	}

	distinctValues := func(field string) []interface{} {
		var vals []interface{}
		if err := coll.Distinct(ctx.Request.Context(), field, bson.M{}).Decode(&vals); err != nil {
			return []interface{}{}
		}

		return vals
	}

	actorsRaw := distinctValues("actor")
	actionsRaw := distinctValues("action")
	targetsRaw := distinctValues("target")

	ctx.JSON(http.StatusOK, gin.H{
		"actors":  toStrings(actorsRaw),
		"actions": toStrings(actionsRaw),
		"targets": toStrings(targetsRaw),
	})
}

// Export streams audit logs as CSV, with optional filters and time range
func (h *AuditHandler) Export(ctx *gin.Context) {
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	// Build filter
	filter := bson.M{}
	if actor := ctx.Query("actor"); actor != "" {
		filter["actor"] = actor
	}

	if action := ctx.Query("action"); action != "" {
		filter["action"] = action
	}

	if target := ctx.Query("target"); target != "" {
		filter["target"] = target
	}

	if from := ctx.Query("from"); from != "" {
		if _, err := time.Parse(time.RFC3339, from); err == nil {
			filter["ts"] = bson.M{"$gte": from}
		}
	}

	if to := ctx.Query("to"); to != "" {
		if _, err := time.Parse(time.RFC3339, to); err == nil {
			if existing, ok := filter["ts"].(bson.M); ok {
				existing["$lte"] = to
				filter["ts"] = existing
			} else {
				filter["ts"] = bson.M{"$lte": to}
			}
		}
	}

	// Prepare response headers
	filename := fmt.Sprintf("audit_%s.csv", time.Now().Format("20060102_150405"))
	ctx.Header("Content-Type", "text/csv; charset=utf-8")
	ctx.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))

	w := csv.NewWriter(ctx.Writer)
	defer w.Flush()

	// Include header row?
	headerParam := strings.ToLower(strings.TrimSpace(ctx.DefaultQuery("header", "1")))
	includeHeader := headerParam == "1" || headerParam == "true" || headerParam == "yes" || headerParam == "on"
	if includeHeader {
		_ = w.Write([]string{"ts", "actor", "actorRoles", "ip", "action", "target", "method", "details"})
	}

	// Query and stream
	coll := h.MongoDB.GetAuditCollection()

	cur, err := coll.Find(ctx.Request.Context(), filter, options.Find().SetSort(bson.D{{Key: "ts", Value: -1}}))
	if err != nil {
		// If writing JSON error after headers might confuse client; but early enough
		ctx.Status(http.StatusInternalServerError)

		return
	}

	defer cur.Close(ctx.Request.Context())

	for cur.Next(ctx.Request.Context()) {
		var e models.AuditLogEntry

		if err := cur.Decode(&e); err != nil {
			continue
		}

		roles := ""
		if len(e.ActorRoles) > 0 {
			roles = strings.Join(e.ActorRoles, ";")
		}

		detailsStr := ""
		if e.Details != nil {
			if b, err := json.Marshal(e.Details); err == nil {
				detailsStr = string(b)
			}
		}

		_ = w.Write([]string{
			e.Timestamp,
			e.Actor,
			roles,
			e.IP,
			e.Action,
			e.Target,
			e.Method,
			detailsStr,
		})
	}
}

func parseInt64(s string) (int64, error) {
	return strconv.ParseInt(s, 10, 64)
}

// Helper: get client IP using trusted-proxy-aware request metadata.
func getClientIP(r *http.Request) string {
	return requestmeta.ClientIP(r)
}

// WriteAudit inserts an immutable audit log record
func WriteAudit(ctx *gin.Context, mongo *db.MongoDB, entry models.AuditLogEntry) {
	if mongo == nil || !mongo.IsConnectedToMongoDB() {
		return
	}

	if entry.Timestamp == "" {
		entry.Timestamp = time.Now().Format(time.RFC3339)
	}

	// Enrich actor/roles if present in context
	if entry.Actor == "" {
		if v, ok := ctx.Get("username"); ok {
			if s, ok2 := v.(string); ok2 {
				entry.Actor = s
			}
		}
	}

	if len(entry.ActorRoles) == 0 {
		if v, ok := ctx.Get("roles"); ok {
			if roles, ok2 := v.([]string); ok2 {
				entry.ActorRoles = roles
			}
		}
	}

	// IP
	if entry.IP == "" {
		entry.IP = getClientIP(ctx.Request)
	}

	// Method
	if entry.Method == "" && ctx != nil && ctx.Request != nil {
		entry.Method = ctx.Request.Method
	}

	// Policy decision: suppress non-relevant events
	if !audit.ShouldAudit(ctx, &entry) {
		// Optionally, we could count suppressed events via metrics; keep it simple for now.
		return
	}

	// Insert-only
	_ = mongo.GetAuditCollection().FindOneAndUpdate(ctx.Request.Context(), bson.M{"_id": nil}, bson.M{"$setOnInsert": bson.M{"guard": true}}) // noop ensure coll exists
	_, _ = mongo.GetAuditCollection().InsertOne(ctx.Request.Context(), entry)
}
