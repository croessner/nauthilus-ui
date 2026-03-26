package profileversion

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

const (
	// DefaultMaxVersionsPerProfile is used when configuration is missing or invalid.
	DefaultMaxVersionsPerProfile = 50
	// maxListLimit is an API safety cap for listing profile versions.
	maxListLimit = 500
)

// CreateSnapshotRequest contains data required to persist one immutable profile snapshot.
type CreateSnapshotRequest struct {
	UserID         string
	ProfileName    string
	Config         map[string]interface{}
	CreatedBy      string
	Source         string
	Comment        string
	Metadata       map[string]interface{}
	AllowDuplicate bool
}

// Service handles immutable profile snapshot persistence.
type Service struct {
	mongo                 *db.MongoDB
	maxVersionsPerProfile int
}

// NewService creates a profile version service.
func NewService(mongoDB *db.MongoDB, maxVersionsPerProfile int) *Service {
	limit := maxVersionsPerProfile
	if limit <= 0 {
		limit = DefaultMaxVersionsPerProfile
	}

	return &Service{
		mongo:                 mongoDB,
		maxVersionsPerProfile: limit,
	}
}

// CreateSnapshot persists one immutable profile snapshot.
func (s *Service) CreateSnapshot(ctx context.Context, request CreateSnapshotRequest) (*models.ProfileVersion, bool, error) {
	if s == nil || s.mongo == nil || !s.mongo.IsConnectedToMongoDB() || s.mongo.ProfileVersionColl == nil {
		return nil, false, errors.New("profile versioning storage unavailable")
	}

	userID := strings.TrimSpace(request.UserID)
	profileName := strings.TrimSpace(request.ProfileName)
	if userID == "" || profileName == "" {
		return nil, false, errors.New("userId and profileName are required")
	}

	normalizedConfig, configHash, err := normalizeConfigForSnapshot(request.Config)
	if err != nil {
		return nil, false, err
	}

	latest, err := s.GetLatestSnapshot(ctx, userID, profileName)
	if err != nil && !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, false, err
	}

	if latest != nil && !request.AllowDuplicate && latest.ConfigHash == configHash {
		return latest, false, nil
	}

	nextVersion := int64(1)
	if latest != nil {
		nextVersion = latest.Version + 1
	}

	now := time.Now().Format(time.RFC3339)
	snapshot := models.ProfileVersion{
		UserID:      userID,
		ProfileName: profileName,
		Version:     nextVersion,
		CreatedAt:   now,
		CreatedBy:   strings.TrimSpace(request.CreatedBy),
		Source:      strings.TrimSpace(request.Source),
		Comment:     strings.TrimSpace(request.Comment),
		Metadata:    request.Metadata,
		ConfigHash:  configHash,
		Config:      normalizedConfig,
	}

	if snapshot.CreatedBy == "" {
		snapshot.CreatedBy = "system"
	}

	if snapshot.Source == "" {
		snapshot.Source = "auto"
	}

	if _, err := s.mongo.ProfileVersionColl.InsertOne(ctx, snapshot); err != nil {
		return nil, false, err
	}

	if err := s.enforceRetention(ctx, userID, profileName); err != nil {
		return nil, false, err
	}

	return &snapshot, true, nil
}

// ListSnapshots returns profile versions in reverse chronological version order.
func (s *Service) ListSnapshots(ctx context.Context, userID, profileName string, limit int64) ([]models.ProfileVersion, error) {
	if s == nil || s.mongo == nil || !s.mongo.IsConnectedToMongoDB() || s.mongo.ProfileVersionColl == nil {
		return nil, errors.New("profile versioning storage unavailable")
	}

	resolvedUserID := strings.TrimSpace(userID)
	resolvedProfileName := strings.TrimSpace(profileName)
	if resolvedUserID == "" || resolvedProfileName == "" {
		return nil, errors.New("userId and profileName are required")
	}

	if limit <= 0 {
		limit = int64(s.maxVersionsPerProfile)
	}

	if limit > maxListLimit {
		limit = maxListLimit
	}

	filter := bson.M{"userId": resolvedUserID, "profileName": resolvedProfileName}
	findOptions := options.Find().
		SetSort(bson.D{{Key: "version", Value: -1}}).
		SetLimit(limit).
		SetProjection(bson.M{
			"userId":     0,
			"config":     0,
			"configHash": 0,
		})

	cursor, err := s.mongo.ProfileVersionColl.Find(ctx, filter, findOptions)
	if err != nil {
		return nil, err
	}

	defer cursor.Close(ctx)

	items := make([]models.ProfileVersion, 0)
	for cursor.Next(ctx) {
		var item models.ProfileVersion
		if err := cursor.Decode(&item); err != nil {
			return nil, err
		}

		items = append(items, item)
	}

	return items, nil
}

// GetSnapshot returns one profile version.
func (s *Service) GetSnapshot(ctx context.Context, userID, profileName string, version int64, includeConfig bool) (*models.ProfileVersion, error) {
	if s == nil || s.mongo == nil || !s.mongo.IsConnectedToMongoDB() || s.mongo.ProfileVersionColl == nil {
		return nil, errors.New("profile versioning storage unavailable")
	}

	filter := bson.M{
		"userId":      strings.TrimSpace(userID),
		"profileName": strings.TrimSpace(profileName),
		"version":     version,
	}

	findOptions := options.FindOne()
	if !includeConfig {
		findOptions.SetProjection(bson.M{
			"userId":     0,
			"config":     0,
			"configHash": 0,
		})
	} else {
		findOptions.SetProjection(bson.M{
			"userId": 0,
		})
	}

	var snapshot models.ProfileVersion
	if err := s.mongo.ProfileVersionColl.FindOne(ctx, filter, findOptions).Decode(&snapshot); err != nil {
		return nil, err
	}

	return &snapshot, nil
}

// GetLatestSnapshot returns the latest snapshot for user/profile.
func (s *Service) GetLatestSnapshot(ctx context.Context, userID, profileName string) (*models.ProfileVersion, error) {
	if s == nil || s.mongo == nil || !s.mongo.IsConnectedToMongoDB() || s.mongo.ProfileVersionColl == nil {
		return nil, errors.New("profile versioning storage unavailable")
	}

	filter := bson.M{
		"userId":      strings.TrimSpace(userID),
		"profileName": strings.TrimSpace(profileName),
	}

	findOptions := options.FindOne().
		SetSort(bson.D{{Key: "version", Value: -1}})

	var snapshot models.ProfileVersion
	if err := s.mongo.ProfileVersionColl.FindOne(ctx, filter, findOptions).Decode(&snapshot); err != nil {
		return nil, err
	}

	return &snapshot, nil
}

// DeleteSnapshot hard-deletes one immutable profile version.
func (s *Service) DeleteSnapshot(ctx context.Context, userID, profileName string, version int64) (bool, error) {
	if s == nil || s.mongo == nil || !s.mongo.IsConnectedToMongoDB() || s.mongo.ProfileVersionColl == nil {
		return false, errors.New("profile versioning storage unavailable")
	}

	result, err := s.mongo.ProfileVersionColl.DeleteOne(ctx, bson.M{
		"userId":      strings.TrimSpace(userID),
		"profileName": strings.TrimSpace(profileName),
		"version":     version,
	})
	if err != nil {
		return false, err
	}

	return result.DeletedCount > 0, nil
}

// RenameProfileSnapshots updates profile names across all snapshots for one user.
func (s *Service) RenameProfileSnapshots(ctx context.Context, userID, oldName, newName string) error {
	if s == nil || s.mongo == nil || !s.mongo.IsConnectedToMongoDB() || s.mongo.ProfileVersionColl == nil {
		return errors.New("profile versioning storage unavailable")
	}

	resolvedUserID := strings.TrimSpace(userID)
	resolvedOld := strings.TrimSpace(oldName)
	resolvedNew := strings.TrimSpace(newName)
	if resolvedUserID == "" || resolvedOld == "" || resolvedNew == "" || resolvedOld == resolvedNew {
		return nil
	}

	_, err := s.mongo.ProfileVersionColl.UpdateMany(ctx, bson.M{
		"userId":      resolvedUserID,
		"profileName": resolvedOld,
	}, bson.M{
		"$set": bson.M{"profileName": resolvedNew},
	})

	return err
}

func (s *Service) enforceRetention(ctx context.Context, userID, profileName string) error {
	if s.maxVersionsPerProfile <= 0 {
		return nil
	}

	filter := bson.M{"userId": userID, "profileName": profileName}
	count, err := s.mongo.ProfileVersionColl.CountDocuments(ctx, filter)
	if err != nil {
		return err
	}

	excess := count - int64(s.maxVersionsPerProfile)
	if excess <= 0 {
		return nil
	}

	cursor, err := s.mongo.ProfileVersionColl.Find(
		ctx,
		filter,
		options.Find().
			SetSort(bson.D{{Key: "version", Value: 1}}).
			SetLimit(excess).
			SetProjection(bson.M{"version": 1}),
	)
	if err != nil {
		return err
	}

	defer cursor.Close(ctx)

	versions := make([]int64, 0, excess)
	for cursor.Next(ctx) {
		var document struct {
			Version int64 `bson:"version"`
		}
		if err := cursor.Decode(&document); err != nil {
			return err
		}

		versions = append(versions, document.Version)
	}

	if len(versions) == 0 {
		return nil
	}

	_, err = s.mongo.ProfileVersionColl.DeleteMany(ctx, bson.M{
		"userId":      userID,
		"profileName": profileName,
		"version":     bson.M{"$in": versions},
	})

	return err
}

func normalizeConfigForSnapshot(config map[string]interface{}) (map[string]interface{}, string, error) {
	if config == nil {
		config = map[string]interface{}{}
	}

	raw, err := json.Marshal(config)
	if err != nil {
		return nil, "", err
	}

	var normalized map[string]interface{}
	if err := json.Unmarshal(raw, &normalized); err != nil {
		return nil, "", err
	}

	sum := sha256.Sum256(raw)
	return normalized, hex.EncodeToString(sum[:]), nil
}
