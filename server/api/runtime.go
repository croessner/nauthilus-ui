package api

import (
	"context"
	"net/http"
	"reflect"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

// canonicalizeBSONRuntime converts BSON container types into standard Go types recursively
func canonicalizeBSONRuntime(v interface{}) interface{} {
	switch t := v.(type) {
	case map[string]interface{}:
		m := make(map[string]interface{}, len(t))
		for k, vv := range t {
			m[k] = canonicalizeBSONRuntime(vv)
		}

		return m
	case bson.A:
		s := make([]interface{}, len(t))
		for i, vv := range t {
			s[i] = canonicalizeBSONRuntime(vv)
		}

		return s
	case []interface{}:
		s := make([]interface{}, len(t))
		for i, vv := range t {
			s[i] = canonicalizeBSONRuntime(vv)
		}

		return s
	default:
		return v
	}
}

// RuntimeHandler handles runtime settings requests
type RuntimeHandler struct {
	MongoDB *db.MongoDB
}

// deepEqualNormalizedRuntime mirrors the normalized equality used for profile diffs.
func deepEqualNormalizedRuntime(a, b interface{}) bool {
	// Canonicalize BSON container types to standard Go types to avoid false positives from type mismatches
	a = canonicalizeBSONRuntime(a)
	b = canonicalizeBSONRuntime(b)

	if a == nil && b == nil {
		return true
	}

	// Treat nil and empty composite (map/slice) as equal
	if a == nil && isEmptyComposite(b) {
		return true
	}

	if b == nil && isEmptyComposite(a) {
		return true
	}

	if a == nil || b == nil {
		return false
	}

	if reflect.TypeOf(a) == reflect.TypeOf(b) {
		switch av := a.(type) {
		case map[string]interface{}:
			bv := b.(map[string]interface{})
			if len(av) != len(bv) {
				return false
			}

			for k, v := range av {
				if !deepEqualNormalizedRuntime(v, bv[k]) {
					return false
				}
			}

			return true
		case []interface{}:
			bs, _ := b.([]interface{})

			// Treat scalar-only slices as multisets (order-insensitive)
			if allScalars(av) && allScalars(bs) {
				return equalScalarSlicesIgnoringOrder(av, bs)
			}

			if len(av) != len(bs) {
				return false
			}

			for i := range av {
				if !deepEqualNormalizedRuntime(av[i], bs[i]) {
					return false
				}
			}

			return true
		default:
			return reflect.DeepEqual(a, b)
		}
	}

	if isNumber(a) && isNumber(b) {
		fa, okA := toFloat64(a)
		fb, okB := toFloat64(b)

		if okA && okB {
			return fa == fb
		}
	}

	if am, aok := a.(map[string]interface{}); aok {
		if bm, bok := b.(map[string]interface{}); bok {
			if len(am) != len(bm) {
				return false
			}

			for k, v := range am {
				if !deepEqualNormalizedRuntime(v, bm[k]) {
					return false
				}
			}

			return true
		}
	}

	if as, aok := a.([]interface{}); aok {
		if bs, bok := b.([]interface{}); bok {
			if allScalars(as) && allScalars(bs) {
				return equalScalarSlicesIgnoringOrder(as, bs)
			}

			if len(as) != len(bs) {
				return false
			}

			for i := range as {
				if !deepEqualNormalizedRuntime(as[i], bs[i]) {
					return false
				}
			}

			return true
		}
	}

	return reflect.DeepEqual(a, b)
}

// diffPathsRuntime collects changed JSON-like paths between prev and next values.
func diffPathsRuntime(prev, next interface{}, prefix string, out *[]string) {
	// Canonicalize BSON containers for stable comparisons
	prev = canonicalizeBSONRuntime(prev)
	next = canonicalizeBSONRuntime(next)

	if prev == nil && next == nil {
		return
	}

	if prev == nil || next == nil {
		if prefix == "" {
			*out = append(*out, ".")
		} else {
			*out = append(*out, prefix)
		}

		return
	}

	switch p := prev.(type) {
	case map[string]interface{}:
		nm, ok := next.(map[string]interface{})
		if !ok {
			if prefix == "" {
				*out = append(*out, ".")
			} else {
				*out = append(*out, prefix)
			}

			return
		}

		seen := map[string]struct{}{}
		for k := range p {
			seen[k] = struct{}{}
		}

		for k := range nm {
			seen[k] = struct{}{}
		}

		for k := range seen {
			cp := k
			if prefix != "" {
				cp = prefix + "." + k
			}

			diffPathsRuntime(p[k], nm[k], cp, out)
		}
	case []interface{}:
		if !deepEqualNormalizedRuntime(prev, next) {
			if prefix == "" {
				*out = append(*out, "[]")
			} else {
				*out = append(*out, prefix)
			}
		}
	default:
		if !deepEqualNormalizedRuntime(prev, next) {
			if prefix == "" {
				*out = append(*out, ".")
			} else {
				*out = append(*out, prefix)
			}
		}
	}
}

// NewRuntimeHandler creates a new RuntimeHandler
func NewRuntimeHandler(mongoDB *db.MongoDB) *RuntimeHandler {
	return &RuntimeHandler{
		MongoDB: mongoDB,
	}
}

// RegisterRoutes registers the runtime settings routes
func (h *RuntimeHandler) RegisterRoutes(router *gin.Engine) {
	router.GET("/api/runtime/:userId/:profileName", h.GetRuntimeSettings)
	router.POST("/api/runtime/:userId/:profileName", h.SaveRuntimeSettings)
	router.DELETE("/api/runtime/:userId/:profileName", h.DeleteRuntimeSettings)
}

// GetRuntimeSettings handles the GET /api/runtime/:userId/:profileName endpoint
func (h *RuntimeHandler) GetRuntimeSettings(ctx *gin.Context) {
	// If MongoDB is not connected, return empty runtime settings
	if !h.MongoDB.IsConnected {
		ctx.JSON(http.StatusOK, models.RuntimeSettingsResponse{
			Connection: map[string]interface{}{},
			Hooks:      map[string]interface{}{},
		})

		return
	}

	userID := ctx.Param("userId")
	profileName := ctx.Param("profileName")
	var runtimeSettings models.RuntimeSettings

	err := h.MongoDB.RuntimeColl.FindOne(
		context.Background(),
		bson.M{"userId": userID, "profileName": profileName},
	).Decode(&runtimeSettings)

	if err != nil {
		// If no runtime settings found, return empty settings
		ctx.JSON(http.StatusOK, models.RuntimeSettingsResponse{
			Connection: map[string]interface{}{},
			Hooks:      map[string]interface{}{},
		})

		return
	}

	ctx.JSON(http.StatusOK, models.RuntimeSettingsResponse{
		Connection: runtimeSettings.Connection,
		Hooks:      runtimeSettings.Hooks,
	})
}

// SaveRuntimeSettings handles the POST /api/runtime/:userId/:profileName endpoint
func (h *RuntimeHandler) SaveRuntimeSettings(ctx *gin.Context) {
	// If MongoDB is not connected, return success but log warning
	if !h.MongoDB.IsConnected {
		var runtimeResponse models.RuntimeSettingsResponse
		if err := ctx.ShouldBindJSON(&runtimeResponse); err != nil {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

			return
		}

		ctx.JSON(http.StatusOK, runtimeResponse)

		return
	}

	userID := ctx.Param("userId")
	profileName := ctx.Param("profileName")
	var runtimeResponse models.RuntimeSettingsResponse
	if err := ctx.ShouldBindJSON(&runtimeResponse); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	// Load previous runtime to compute diffs (best-effort)
	type prevDoc struct {
		Connection map[string]interface{} `bson:"connection"`
		Hooks      map[string]interface{} `bson:"hooks"`
	}

	var prev prevDoc
	_ = h.MongoDB.RuntimeColl.FindOne(context.Background(), bson.M{"userId": userID, "profileName": profileName}).Decode(&prev)

	var connChanged []string
	diffPathsRuntime(prev.Connection, runtimeResponse.Connection, "connection", &connChanged)

	var hooksChanged []string
	diffPathsRuntime(prev.Hooks, runtimeResponse.Hooks, "hooks", &hooksChanged)

	// Update or create runtime settings
	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
	filter := bson.M{"userId": userID, "profileName": profileName}
	update := bson.M{
		"$set": bson.M{
			"userId":      userID,
			"profileName": profileName,
			"connection":  runtimeResponse.Connection,
			"hooks":       runtimeResponse.Hooks,
		},
	}

	var runtimeSettings models.RuntimeSettings
	err := h.MongoDB.RuntimeColl.FindOneAndUpdate(
		context.Background(),
		filter,
		update,
		opts,
	).Decode(&runtimeSettings)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to save runtime settings"})

		return
	}

	// Audit runtime settings update
	WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
		Action: "runtime.update",
		Target: userID + "/" + profileName,
		Details: map[string]interface{}{
			"connectionCount": len(runtimeResponse.Connection),
			"hooksCount":      len(runtimeResponse.Hooks),
			"changed":         append(connChanged, hooksChanged...),
		},
	})

	ctx.JSON(http.StatusOK, models.RuntimeSettingsResponse{
		Connection: runtimeSettings.Connection,
		Hooks:      runtimeSettings.Hooks,
	})
}

// DeleteRuntimeSettings handles the DELETE /api/runtime/:userId/:profileName endpoint
func (h *RuntimeHandler) DeleteRuntimeSettings(ctx *gin.Context) {
	// If MongoDB is not connected, return success
	if !h.MongoDB.IsConnected {
		ctx.JSON(http.StatusOK, models.MessageResponse{Message: "Runtime settings deleted successfully"})
		return
	}

	userID := ctx.Param("userId")
	profileName := ctx.Param("profileName")

	// Delete runtime settings
	filter := bson.M{"userId": userID, "profileName": profileName}
	result, err := h.MongoDB.RuntimeColl.DeleteOne(context.Background(), filter)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to delete runtime settings"})
		return
	}

	if result.DeletedCount == 0 {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Runtime settings not found"})
		return
	}

	// Audit runtime settings deletion
	WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
		Action: "runtime.delete",
		Target: userID + "/" + profileName,
	})

	ctx.JSON(http.StatusOK, models.MessageResponse{Message: "Runtime settings deleted successfully"})
}
