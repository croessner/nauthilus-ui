package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
	"nauthilus-ui/server/profileversion"
	"nauthilus-ui/server/utils"
)

const (
	profileVersionSourceAuto    = "auto"
	profileVersionSourceManual  = "manual"
	profileVersionSourceRestore = "restore"
	profileVersionSourceGitPull = "git_pull"
)

// ProfileVersionManager abstracts immutable profile snapshot persistence.
type ProfileVersionManager interface {
	CreateSnapshot(ctx context.Context, request profileversion.CreateSnapshotRequest) (*models.ProfileVersion, bool, error)
	ListSnapshots(ctx context.Context, userID, profileName string, limit int64) ([]models.ProfileVersion, error)
	GetSnapshot(ctx context.Context, userID, profileName string, version int64, includeConfig bool) (*models.ProfileVersion, error)
	DeleteSnapshot(ctx context.Context, userID, profileName string, version int64) (bool, error)
	RenameProfileSnapshots(ctx context.Context, userID, oldName, newName string) error
}

// ProfileHandler handles profile requests
type ProfileHandler struct {
	MongoDB        *db.MongoDB
	VersionManager ProfileVersionManager
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

// NewProfileHandler creates a new ProfileHandler.
func NewProfileHandler(mongoDB *db.MongoDB, versionManager ProfileVersionManager) *ProfileHandler {
	return &ProfileHandler{
		MongoDB:        mongoDB,
		VersionManager: versionManager,
	}
}

// RegisterRoutes registers the profile routes
func (h *ProfileHandler) RegisterRoutes(router *gin.Engine) {
	router.GET("/api/profiles/:userId", RequireSelfOrAdmin("userId"), h.GetProfiles)
	router.POST("/api/profiles/:userId", RequireSelfOrAdmin("userId"), h.SaveProfiles)
	router.GET("/api/profiles/:userId/:profileName/versions", RequireSelfOrAdmin("userId"), h.ListProfileVersions)
	router.POST("/api/profiles/:userId/:profileName/versions/snapshots", RequireSelfOrAdmin("userId"), h.CreateManualProfileSnapshot)
	router.POST("/api/profiles/:userId/:profileName/versions/:version/restore", RequireSelfOrAdmin("userId"), h.RestoreProfileVersion)
	router.DELETE("/api/profiles/:userId/:profileName/versions/:version", RequireSelfOrAdmin("userId"), h.DeleteProfileVersion)
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
		var request models.SaveProfilesRequest
		if err := ctx.ShouldBindJSON(&request); err != nil {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})
			return
		}

		ctx.JSON(http.StatusOK, models.ProfileResponse{
			Profiles:           request.Profiles,
			CurrentProfileName: request.CurrentProfileName,
		})

		return
	}

	userID := ctx.Param("userId")
	var request models.SaveProfilesRequest
	if err := ctx.ShouldBindJSON(&request); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	source := profileVersionSourceAuto
	comment := ""
	metadata := map[string]interface{}(nil)
	if request.VersionContext != nil {
		source = sanitizeProfileVersionSource(request.VersionContext.Source)
		comment = strings.TrimSpace(request.VersionContext.Comment)
		metadata = sanitizeProfileVersionMetadata(source, request.VersionContext.Metadata)
	}

	profile, changedPaths, err := h.saveProfilesInternal(ctx, userID, request, saveProfileSnapshotOptions{
		Source:         source,
		Comment:        comment,
		Metadata:       metadata,
		AllowDuplicate: false,
	})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to save profiles"})

		return
	}

	// Audit settings save for profiles
	WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
		Action: "settings.save",
		Target: userID + "/" + request.CurrentProfileName,
		Details: map[string]interface{}{
			"profilesCount": len(profile.Profiles),
			"changed":       changedPaths,
			"source":        source,
		},
	})

	ctx.JSON(http.StatusOK, models.ProfileResponse{
		Profiles:           profile.Profiles,
		CurrentProfileName: profile.CurrentProfileName,
	})
}

// ListProfileVersions handles GET /api/profiles/:userId/:profileName/versions.
func (h *ProfileHandler) ListProfileVersions(ctx *gin.Context) {
	if h.VersionManager == nil {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Profile versioning unavailable"})

		return
	}

	userID := strings.TrimSpace(ctx.Param("userId"))
	profileName := strings.TrimSpace(ctx.Param("profileName"))
	if userID == "" || profileName == "" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid profile identifier"})

		return
	}

	limit := int64(100)
	if rawLimit := strings.TrimSpace(ctx.Query("limit")); rawLimit != "" {
		parsed, err := strconv.ParseInt(rawLimit, 10, 64)
		if err != nil || parsed <= 0 {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid limit"})

			return
		}

		limit = parsed
	}

	items, err := h.VersionManager.ListSnapshots(ctx.Request.Context(), userID, profileName, limit)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to load profile versions"})

		return
	}

	ctx.JSON(http.StatusOK, models.ProfileVersionsResponse{Items: items})
}

// CreateManualProfileSnapshot handles POST /api/profiles/:userId/:profileName/versions/snapshots.
func (h *ProfileHandler) CreateManualProfileSnapshot(ctx *gin.Context) {
	if h.VersionManager == nil {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Profile versioning unavailable"})

		return
	}

	userID := strings.TrimSpace(ctx.Param("userId"))
	profileName := strings.TrimSpace(ctx.Param("profileName"))
	if userID == "" || profileName == "" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid profile identifier"})

		return
	}

	var request models.ProfileSnapshotRequest
	if err := ctx.ShouldBindJSON(&request); err != nil && !errors.Is(err, io.EOF) {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	profile, err := h.loadProfile(ctx.Request.Context(), userID)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Profiles not found"})
		} else {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to load profile"})
		}

		return
	}

	config := findProfileConfig(profile.Profiles, profileName)
	if config == nil {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Profile not found"})

		return
	}

	version, created, err := h.VersionManager.CreateSnapshot(ctx.Request.Context(), profileversion.CreateSnapshotRequest{
		UserID:         userID,
		ProfileName:    profileName,
		Config:         config,
		CreatedBy:      CurrentUsername(ctx),
		Source:         profileVersionSourceManual,
		Comment:        strings.TrimSpace(request.Comment),
		AllowDuplicate: true,
	})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create profile snapshot"})

		return
	}

	WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
		Action: "settings.version.snapshot",
		Target: userID + "/" + profileName,
		Details: map[string]interface{}{
			"created": created,
			"version": version.Version,
		},
	})

	ctx.JSON(http.StatusOK, models.ProfileVersionResponse{
		Version: *version,
		Created: created,
	})
}

// RestoreProfileVersion handles POST /api/profiles/:userId/:profileName/versions/:version/restore.
func (h *ProfileHandler) RestoreProfileVersion(ctx *gin.Context) {
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	if h.VersionManager == nil {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Profile versioning unavailable"})

		return
	}

	userID := strings.TrimSpace(ctx.Param("userId"))
	profileName := strings.TrimSpace(ctx.Param("profileName"))
	if userID == "" || profileName == "" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid profile identifier"})

		return
	}

	versionNumber, ok := parsePositiveVersionParam(ctx)
	if !ok {
		return
	}

	var request models.ProfileRestoreRequest
	if err := ctx.ShouldBindJSON(&request); err != nil && !errors.Is(err, io.EOF) {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	snapshot, err := h.VersionManager.GetSnapshot(ctx.Request.Context(), userID, profileName, versionNumber, true)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Profile version not found"})
		} else {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to load profile version"})
		}

		return
	}

	current, err := h.loadProfile(ctx.Request.Context(), userID)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Profiles not found"})
		} else {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to load profile"})
		}

		return
	}

	restoredProfiles := make([]models.ProfileData, 0, len(current.Profiles))
	found := false
	for _, profileItem := range current.Profiles {
		if profileItem.Name == profileName {
			restoredProfiles = append(restoredProfiles, models.ProfileData{
				Name:   profileItem.Name,
				Config: snapshot.Config,
			})
			found = true
		} else {
			restoredProfiles = append(restoredProfiles, profileItem)
		}
	}

	if !found {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Profile not found"})

		return
	}

	persisted, _, err := h.saveProfilesInternal(ctx, userID, models.SaveProfilesRequest{
		Profiles:           restoredProfiles,
		CurrentProfileName: current.CurrentProfileName,
	}, saveProfileSnapshotOptions{
		Source:         profileVersionSourceRestore,
		Comment:        strings.TrimSpace(request.Comment),
		AllowDuplicate: true,
		ForcedProfiles: []string{profileName},
		AdditionalMeta: map[string]interface{}{"restoredFromVersion": versionNumber},
	})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to restore profile version"})

		return
	}

	WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
		Action: "settings.version.restore",
		Target: userID + "/" + profileName,
		Details: map[string]interface{}{
			"restoredFromVersion": versionNumber,
		},
	})

	ctx.JSON(http.StatusOK, gin.H{
		"profiles":            persisted.Profiles,
		"currentProfileName":  persisted.CurrentProfileName,
		"restoredFromVersion": versionNumber,
	})
}

// DeleteProfileVersion handles DELETE /api/profiles/:userId/:profileName/versions/:version.
func (h *ProfileHandler) DeleteProfileVersion(ctx *gin.Context) {
	if h.VersionManager == nil {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Profile versioning unavailable"})

		return
	}

	userID := strings.TrimSpace(ctx.Param("userId"))
	profileName := strings.TrimSpace(ctx.Param("profileName"))
	if userID == "" || profileName == "" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid profile identifier"})

		return
	}

	versionNumber, ok := parsePositiveVersionParam(ctx)
	if !ok {
		return
	}

	deleted, err := h.VersionManager.DeleteSnapshot(ctx.Request.Context(), userID, profileName, versionNumber)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to delete profile version"})

		return
	}

	if !deleted {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Profile version not found"})

		return
	}

	WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
		Action: "settings.version.delete",
		Target: userID + "/" + profileName,
		Details: map[string]interface{}{
			"version": versionNumber,
		},
	})

	ctx.JSON(http.StatusOK, models.MessageResponse{Message: "Profile version deleted"})
}

type saveProfileSnapshotOptions struct {
	Source         string
	Comment        string
	Metadata       map[string]interface{}
	AdditionalMeta map[string]interface{}
	AllowDuplicate bool
	ForcedProfiles []string
}

func (h *ProfileHandler) saveProfilesInternal(
	ctx *gin.Context,
	userID string,
	request models.SaveProfilesRequest,
	snapshotOptions saveProfileSnapshotOptions,
) (*models.Profile, []string, error) {
	if !h.MongoDB.IsConnectedToMongoDB() {
		return nil, nil, errors.New("database not connected")
	}

	resolvedUserID := strings.TrimSpace(userID)
	if resolvedUserID == "" {
		return nil, nil, errors.New("userId is required")
	}

	currentProfileName := strings.TrimSpace(request.CurrentProfileName)
	if currentProfileName == "" && len(request.Profiles) > 0 {
		currentProfileName = request.Profiles[0].Name
	}

	var previous models.Profile
	err := h.MongoDB.ProfileColl.FindOne(ctx.Request.Context(), bson.M{"userId": resolvedUserID}).Decode(&previous)
	if err != nil && !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil, err
	}

	var changedPaths []string
	diffPaths(
		findProfileConfig(previous.Profiles, currentProfileName),
		findProfileConfig(request.Profiles, currentProfileName),
		"",
		&changedPaths,
	)

	renamedProfiles := detectRenamedProfiles(previous.Profiles, request.Profiles)
	changedProfiles := detectChangedProfiles(previous.Profiles, request.Profiles)

	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
	filter := bson.M{"userId": resolvedUserID}
	update := bson.M{
		"$set": bson.M{
			"userId":             resolvedUserID,
			"profiles":           request.Profiles,
			"currentProfileName": currentProfileName,
		},
	}

	var persisted models.Profile
	if err := h.MongoDB.ProfileColl.FindOneAndUpdate(ctx.Request.Context(), filter, update, opts).Decode(&persisted); err != nil {
		return nil, nil, err
	}

	if err := h.syncActiveProfileHooks(ctx.Request.Context(), resolvedUserID, currentProfileName, persisted.Profiles); err != nil {
		return nil, nil, err
	}

	if h.VersionManager != nil {
		for oldName, newName := range renamedProfiles {
			_ = h.VersionManager.RenameProfileSnapshots(ctx.Request.Context(), resolvedUserID, oldName, newName)
		}
	}

	profilesForSnapshots := make(map[string]struct{}, len(changedProfiles)+len(snapshotOptions.ForcedProfiles))
	for _, name := range changedProfiles {
		profilesForSnapshots[name] = struct{}{}
	}

	for _, forced := range snapshotOptions.ForcedProfiles {
		if trimmed := strings.TrimSpace(forced); trimmed != "" {
			profilesForSnapshots[trimmed] = struct{}{}
		}
	}

	if len(profilesForSnapshots) == 0 {
		return &persisted, changedPaths, nil
	}

	if h.VersionManager == nil {
		return nil, nil, errors.New("profile versioning unavailable")
	}

	source := sanitizeProfileVersionSource(snapshotOptions.Source)
	mergedMetadata := mergeMetadata(snapshotOptions.Metadata, snapshotOptions.AdditionalMeta)
	actor := CurrentUsername(ctx)
	if strings.TrimSpace(actor) == "" {
		actor = "system"
	}

	for profileName := range profilesForSnapshots {
		config := findProfileConfig(persisted.Profiles, profileName)
		if config == nil {
			continue
		}

		_, _, err := h.VersionManager.CreateSnapshot(ctx.Request.Context(), profileversion.CreateSnapshotRequest{
			UserID:         resolvedUserID,
			ProfileName:    profileName,
			Config:         config,
			CreatedBy:      actor,
			Source:         source,
			Comment:        strings.TrimSpace(snapshotOptions.Comment),
			Metadata:       mergedMetadata,
			AllowDuplicate: snapshotOptions.AllowDuplicate,
		})
		if err != nil {
			return nil, nil, err
		}
	}

	return &persisted, changedPaths, nil
}

func (h *ProfileHandler) syncActiveProfileHooks(
	ctx context.Context,
	userID, currentProfileName string,
	profiles []models.ProfileData,
) error {
	activeConfig := findProfileConfig(profiles, currentProfileName)
	if activeConfig == nil {
		return nil
	}

	var customHooks []interface{}
	if luaSection, ok := activeConfig["lua"].(map[string]interface{}); ok {
		if hooks, ok := luaSection["custom_hooks"].([]interface{}); ok {
			customHooks = hooks
		}
	}

	runtimeFilter := bson.M{"userId": userID, "profileName": currentProfileName}

	type runtimeDoc struct {
		Connection map[string]interface{} `bson:"connection"`
		Hooks      map[string]interface{} `bson:"hooks"`
	}

	var existing runtimeDoc
	if err := h.MongoDB.RuntimeColl.FindOne(ctx, runtimeFilter).Decode(&existing); err != nil && !errors.Is(err, mongo.ErrNoDocuments) {
		return err
	}

	newHooks := bson.M{}
	for key, value := range existing.Hooks {
		newHooks[key] = value
	}

	if customHooks != nil {
		newHooks["custom_hooks"] = customHooks
	}

	_, err := h.MongoDB.RuntimeColl.UpdateOne(
		ctx,
		runtimeFilter,
		bson.M{
			"$set": bson.M{
				"userId":      userID,
				"profileName": currentProfileName,
				"connection":  existing.Connection,
				"hooks":       newHooks,
			},
		},
		options.UpdateOne().SetUpsert(true),
	)

	return err
}

func (h *ProfileHandler) loadProfile(ctx context.Context, userID string) (*models.Profile, error) {
	var profile models.Profile
	if err := h.MongoDB.ProfileColl.FindOne(ctx, bson.M{"userId": userID}).Decode(&profile); err != nil {
		return nil, err
	}

	return &profile, nil
}

func parsePositiveVersionParam(ctx *gin.Context) (int64, bool) {
	versionRaw := strings.TrimSpace(ctx.Param("version"))
	version, err := strconv.ParseInt(versionRaw, 10, 64)
	if err != nil || version <= 0 {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid version"})

		return 0, false
	}

	return version, true
}

func sanitizeProfileVersionSource(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case profileVersionSourceManual:
		return profileVersionSourceManual
	case profileVersionSourceRestore:
		return profileVersionSourceRestore
	case profileVersionSourceGitPull:
		return profileVersionSourceGitPull
	default:
		return profileVersionSourceAuto
	}
}

func sanitizeProfileVersionMetadata(source string, metadata map[string]interface{}) map[string]interface{} {
	if len(metadata) == 0 {
		return nil
	}

	raw, err := json.Marshal(metadata)
	if err != nil {
		return nil
	}

	var sanitized map[string]interface{}
	if err := json.Unmarshal(raw, &sanitized); err != nil {
		return nil
	}

	if source == profileVersionSourceGitPull {
		if repositoryURL, ok := sanitized["repositoryUrl"].(string); ok {
			sanitized["repositoryUrl"] = utils.RedactURLString(repositoryURL)
		}
	}

	return sanitized
}

func mergeMetadata(base, additional map[string]interface{}) map[string]interface{} {
	if len(base) == 0 && len(additional) == 0 {
		return nil
	}

	merged := map[string]interface{}{}
	for key, value := range base {
		merged[key] = value
	}

	for key, value := range additional {
		merged[key] = value
	}

	return merged
}

func findProfileConfig(profiles []models.ProfileData, profileName string) map[string]interface{} {
	for _, profile := range profiles {
		if profile.Name == profileName {
			return profile.Config
		}
	}

	return nil
}

func profileConfigsByName(profiles []models.ProfileData) map[string]map[string]interface{} {
	configs := make(map[string]map[string]interface{}, len(profiles))
	for _, profile := range profiles {
		configs[profile.Name] = profile.Config
	}

	return configs
}

func detectChangedProfiles(previous, next []models.ProfileData) []string {
	previousByName := profileConfigsByName(previous)
	nextByName := profileConfigsByName(next)

	changed := make([]string, 0)
	for profileName, nextConfig := range nextByName {
		previousConfig, exists := previousByName[profileName]
		if !exists || !deepEqualNormalized(previousConfig, nextConfig) {
			changed = append(changed, profileName)
		}
	}

	sort.Strings(changed)
	return changed
}

func detectRenamedProfiles(previous, next []models.ProfileData) map[string]string {
	previousByName := profileConfigsByName(previous)
	nextByName := profileConfigsByName(next)

	removed := make([]string, 0)
	added := make([]string, 0)
	for profileName := range previousByName {
		if _, exists := nextByName[profileName]; !exists {
			removed = append(removed, profileName)
		}
	}

	for profileName := range nextByName {
		if _, exists := previousByName[profileName]; !exists {
			added = append(added, profileName)
		}
	}

	renamed := make(map[string]string)
	usedAdded := make(map[string]struct{})
	for _, removedName := range removed {
		removedConfig := previousByName[removedName]
		for _, addedName := range added {
			if _, alreadyUsed := usedAdded[addedName]; alreadyUsed {
				continue
			}

			if deepEqualNormalized(removedConfig, nextByName[addedName]) {
				renamed[removedName] = addedName
				usedAdded[addedName] = struct{}{}

				break
			}
		}
	}

	return renamed
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
