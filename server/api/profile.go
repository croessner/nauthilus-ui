package api

import (
	"context"
	"fmt"
	"net/http"
	"reflect"
	"strconv"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

// ProfileHandler handles profile requests
type ProfileHandler struct {
	MongoDB *db.MongoDB
}

// deepEqualNormalized compares two interface{} values for semantic equality.
// It treats numerically equal values as equal even if their concrete types differ (e.g., int vs float64),
// and recurses through maps and slices. For slices consisting only of primitive scalars
// (strings, numbers, booleans, null), it compares as multisets (order-insensitive) to
// avoid false positives due to unstable JSON ordering. Additionally, it treats nil and
// empty composites (empty map/slice) as equal to avoid spurious diffs when clients send
// empty objects/arrays for absent fields.
// It also canonicalizes BSON container types (bson.M/primitive.M and bson.A/primitive.A)
// into standard Go maps/slices to avoid false positives due to dynamic type mismatches.
func deepEqualNormalized(a, b interface{}) bool {
	// Canonicalize BSON-specific container types first
	a = canonicalizeBSON(a)
	b = canonicalizeBSON(b)

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

	// Fast path when dynamic types match
	if reflect.TypeOf(a) == reflect.TypeOf(b) {
		switch av := a.(type) {
		case map[string]interface{}:
			bv := b.(map[string]interface{})
			if len(av) != len(bv) {
				return false
			}

			for k, v := range av {
				if !deepEqualNormalized(v, bv[k]) {
					return false
				}
			}

			return true
		case []interface{}:
			bs, _ := b.([]interface{})
			// If both are slices of scalars, compare as multisets (order-insensitive)
			if allScalars(av) && allScalars(bs) {
				return equalScalarSlicesIgnoringOrder(av, bs)
			}

			// Otherwise, compare element-wise (order-sensitive)
			if len(av) != len(bs) {
				return false
			}

			for i := range av {
				if !deepEqualNormalized(av[i], bs[i]) {
					return false
				}
			}

			return true
		default:
			return reflect.DeepEqual(a, b)
		}
	}

	// Handle cross-type numeric equality
	if isNumber(a) && isNumber(b) {
		fa, okA := toFloat64(a)
		fb, okB := toFloat64(b)

		if okA && okB {
			return fa == fb
		}
	}

	// If both are maps with different dynamic types, recurse by casting
	if am, aok := a.(map[string]interface{}); aok {
		if bm, bok := b.(map[string]interface{}); bok {
			if len(am) != len(bm) {
				return false
			}

			for k, v := range am {
				if !deepEqualNormalized(v, bm[k]) {
					return false
				}
			}

			return true
		}
	}

	// If both are slices with different dynamic types, handle scalar-multiset fast path then element-wise
	if as, aok := a.([]interface{}); aok {
		if bs, bok := b.([]interface{}); bok {
			if allScalars(as) && allScalars(bs) {
				return equalScalarSlicesIgnoringOrder(as, bs)
			}

			if len(as) != len(bs) {
				return false
			}

			for i := range as {
				if !deepEqualNormalized(as[i], bs[i]) {
					return false
				}
			}

			return true
		}
	}

	// Fallback
	return reflect.DeepEqual(a, b)
}

func isNumber(v interface{}) bool {
	switch v.(type) {
	case int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64,
		float32, float64:
		return true
	}

	return false
}

func toFloat64(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case int8:
		return float64(n), true
	case int16:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case uint:
		return float64(n), true
	case uint8:
		return float64(n), true
	case uint16:
		return float64(n), true
	case uint32:
		return float64(n), true
	case uint64:
		return float64(n), true
	case float32:
		return float64(n), true
	case float64:
		return n, true
	default:
		return 0, false
	}
}

// diffPaths collects JSON-style paths that differ between prev and next.
// For maps it descends recursively; for slices and scalars it marks the whole prefix when changed,
// using deepEqualNormalized to avoid false positives due to numeric type differences.
func diffPaths(prev, next interface{}, prefix string, out *[]string) {
	// Canonicalize BSON containers to standard Go types to ensure stable comparisons
	prev = canonicalizeBSON(prev)
	next = canonicalizeBSON(next)

	// Normalize nils
	if prev == nil && next == nil {
		return
	}

	// Treat nil vs empty composite as equal (no diff)
	if prev == nil && isEmptyComposite(next) {
		return
	}

	if next == nil && isEmptyComposite(prev) {
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

		// union of keys
		seen := map[string]struct{}{}
		for k := range p {
			seen[k] = struct{}{}
		}

		for k := range nm {
			seen[k] = struct{}{}
		}

		for k := range seen {
			childPrefix := k
			if prefix != "" {
				childPrefix = prefix + "." + k
			}

			diffPaths(p[k], nm[k], childPrefix, out)
		}
	case []interface{}:
		if !deepEqualNormalized(prev, next) {
			if prefix == "" {
				*out = append(*out, "[]")
			} else {
				*out = append(*out, prefix)
			}
		}
	default:
		if !deepEqualNormalized(prev, next) {
			if prefix == "" {
				*out = append(*out, ".")
			} else {
				*out = append(*out, prefix)
			}
		}
	}
}

// NewProfileHandler creates a new ProfileHandler
func NewProfileHandler(mongoDB *db.MongoDB) *ProfileHandler {
	return &ProfileHandler{
		MongoDB: mongoDB,
	}
}

// RegisterRoutes registers the profile routes
func (h *ProfileHandler) RegisterRoutes(router *gin.Engine) {
	router.GET("/api/profiles/:userId", RequireSelfOrAdmin("userId"), h.GetProfiles)
	router.POST("/api/profiles/:userId", RequireSelfOrAdmin("userId"), h.SaveProfiles)
}

// GetProfiles handles the GET /api/profiles/:userId endpoint
func (h *ProfileHandler) GetProfiles(ctx *gin.Context) {
	// If MongoDB is not connected, return default profile
	if !h.MongoDB.IsConnected {
		ctx.JSON(http.StatusOK, models.ProfileResponse{
			Profiles: []models.ProfileData{
				{
					Name: "Default",
					Config: map[string]interface{}{
						"server": map[string]interface{}{
							"address":                      "127.0.0.1:8080",
							"instance_name":                "nauthilus",
							"max_concurrent_requests":      100,
							"max_password_history_entries": 10,
							"redis": map[string]interface{}{
								"database_number": 0,
								"prefix":          "nt:",
								"master": map[string]interface{}{
									"address": "127.0.0.1:6379",
								},
							},
						},
						"connection": map[string]interface{}{
							"backend_url": "http://127.0.0.1:8080",
							"basic_auth": map[string]interface{}{
								"enabled":  false,
								"username": "",
								"password": "",
							},
							"oidc_auth": map[string]interface{}{
								"enabled":                      false,
								"token_endpoint_auth_method":   "client_secret_post",
								"client_id":                    "",
								"client_secret":                "",
								"private_key_pem":              "",
								"private_key_algorithm":        "RS256",
								"private_key_id":               "",
								"client_assertion_ttl_seconds": 300,
								"discovery_mode":               "auto",
								"discovery_url":                "",
								"token_endpoint":               "",
								"introspection_mode":           "auto",
								"introspection_endpoint":       "",
								"introspection_auth_method":    "auto",
								"scope":                        "nauthilus:authenticate nauthilus:security",
								"token":                        "",
								"expires_at":                   0,
							},
						},
					},
				},
			},
			CurrentProfileName: "Default",
		})

		return
	}

	userID := ctx.Param("userId")
	var profile models.Profile

	err := h.MongoDB.ProfileColl.FindOne(ctx.Request.Context(), bson.M{"userId": userID}).Decode(&profile)
	if err != nil {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Profiles not found"})

		return
	}

	ctx.JSON(http.StatusOK, models.ProfileResponse{
		Profiles:           profile.Profiles,
		CurrentProfileName: profile.CurrentProfileName,
	})
}

// SaveProfiles handles the POST /api/profiles/:userId endpoint
func (h *ProfileHandler) SaveProfiles(ctx *gin.Context) {
	// If MongoDB is not connected, return success but log warning
	if !h.MongoDB.IsConnected {
		var profileResponse models.ProfileResponse
		if err := ctx.ShouldBindJSON(&profileResponse); err != nil {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})
			return
		}

		ctx.JSON(http.StatusOK, profileResponse)

		return
	}

	userID := ctx.Param("userId")
	var profileResponse models.ProfileResponse
	if err := ctx.ShouldBindJSON(&profileResponse); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	// Load previous profile to compute diffs (best-effort)
	var prevProfile models.Profile
	_ = h.MongoDB.ProfileColl.FindOne(context.Background(), bson.M{"userId": userID}).Decode(&prevProfile)

	// Compute diff for active profile config between prev and incoming
	var prevActive map[string]interface{}
	for _, p := range prevProfile.Profiles {
		if p.Name == profileResponse.CurrentProfileName {
			prevActive = p.Config

			break
		}
	}

	var nextActive map[string]interface{}
	for _, p := range profileResponse.Profiles {
		if p.Name == profileResponse.CurrentProfileName {
			nextActive = p.Config

			break
		}
	}

	var changed []string
	diffPaths(prevActive, nextActive, "", &changed)

	// Update or create profile data
	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
	filter := bson.M{"userId": userID}
	update := bson.M{
		"$set": bson.M{
			"userId":             userID,
			"profiles":           profileResponse.Profiles,
			"currentProfileName": profileResponse.CurrentProfileName,
		},
	}

	var profile models.Profile
	err := h.MongoDB.ProfileColl.FindOneAndUpdate(
		context.Background(),
		filter,
		update,
		opts,
	).Decode(&profile)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to save profiles"})

		return
	}

	// After profiles are saved, sync custom_hooks from the currently active profile into runtime collection
	currentProfileName := profileResponse.CurrentProfileName
	var activeConfig map[string]interface{}
	for _, p := range profile.Profiles {
		if p.Name == currentProfileName {
			activeConfig = p.Config

			break
		}
	}

	if activeConfig != nil {
		// Try to extract lua.custom_hooks from the active config (if present)
		var customHooks []interface{}
		if luaSection, ok := activeConfig["lua"].(map[string]interface{}); ok {
			if ch, ok := luaSection["custom_hooks"].([]interface{}); ok {
				customHooks = ch
			}
		}

		// Upsert runtime document for user+profile to set hooks.custom_hooks while preserving existing connection
		runtimeFilter := bson.M{"userId": userID, "profileName": currentProfileName}
		// Read existing connection if present
		type runtimeDoc struct {
			Connection map[string]interface{} `bson:"connection"`
			Hooks      map[string]interface{} `bson:"hooks"`
		}

		var existing runtimeDoc
		h.MongoDB.RuntimeColl.FindOne(context.Background(), runtimeFilter).Decode(&existing)

		newHooks := bson.M{}
		// start from existing hooks map if any
		if existing.Hooks != nil {
			for k, v := range existing.Hooks {
				newHooks[k] = v
			}
		}

		// set/overwrite custom_hooks only if we have them; otherwise keep as-is
		if customHooks != nil {
			newHooks["custom_hooks"] = customHooks
		}

		runtimeUpdate := bson.M{
			"$set": bson.M{
				"userId":      userID,
				"profileName": currentProfileName,
				"connection":  existing.Connection, // preserve
				"hooks":       newHooks,
			},
		}
		_, _ = h.MongoDB.RuntimeColl.UpdateOne(context.Background(), runtimeFilter, runtimeUpdate, options.UpdateOne().SetUpsert(true))
	}

	// Audit settings save for profiles
	WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
		Action: "settings.save",
		Target: userID + "/" + profileResponse.CurrentProfileName,
		Details: map[string]interface{}{
			"profilesCount": len(profile.Profiles),
			"changed":       changed,
		},
	})

	ctx.JSON(http.StatusOK, models.ProfileResponse{
		Profiles:           profile.Profiles,
		CurrentProfileName: profile.CurrentProfileName,
	})
}

// Helpers for order-insensitive comparison of scalar slices
func allScalars(arr []interface{}) bool {
	for _, v := range arr {
		if v == nil {
			continue
		}

		switch v.(type) {
		case string, bool:
			// ok
		case int, int8, int16, int32, int64,
			uint, uint8, uint16, uint32, uint64,
			float32, float64:
			// ok
		default:
			return false
		}
	}

	return true
}

func canonicalScalarKey(v interface{}) string {
	if v == nil {
		return "z:null"
	}
	switch t := v.(type) {
	case string:
		return "s:" + t
	case bool:
		if t {
			return "b:true"
		}
		return "b:false"
	default:
		if isNumber(v) {
			f, ok := toFloat64(v)
			if ok {
				return "n:" + strconv.FormatFloat(f, 'g', -1, 64)
			}
		}
	}

	// Fallback to type+fmt
	return "u:" + fmt.Sprintf("%v", v)
}

func equalScalarSlicesIgnoringOrder(a, b []interface{}) bool {
	if len(a) != len(b) {
		return false
	}

	// Use multiset (count map) to handle duplicates
	counts := make(map[string]int, len(a))
	for _, v := range a {
		counts[canonicalScalarKey(v)]++
	}

	for _, v := range b {
		k := canonicalScalarKey(v)
		if counts[k] == 0 {
			return false
		}

		counts[k]--
		if counts[k] == 0 {
			delete(counts, k)
		}
	}

	return len(counts) == 0
}

// isEmptyComposite returns true if v is an empty map[string]interface{} or []interface{}
// canonicalizeBSON converts MongoDB BSON container types (bson.M/primitive.M and bson.A/primitive.A)
// into standard Go maps/slices recursively so our comparisons don't trip over dynamic type differences.
func canonicalizeBSON(v interface{}) interface{} {
	switch t := v.(type) {
	case map[string]interface{}:
		m := make(map[string]interface{}, len(t))
		for k, vv := range t {
			m[k] = canonicalizeBSON(vv)
		}

		return m
	case bson.A:
		s := make([]interface{}, len(t))
		for i, vv := range t {
			s[i] = canonicalizeBSON(vv)
		}

		return s
	case []interface{}:
		s := make([]interface{}, len(t))
		for i, vv := range t {
			s[i] = canonicalizeBSON(vv)
		}

		return s
	default:
		return v
	}
}

func isEmptyComposite(v interface{}) bool {
	switch t := v.(type) {
	case map[string]interface{}:
		return len(t) == 0
	case []interface{}:
		return len(t) == 0
	default:
		return false
	}
}
