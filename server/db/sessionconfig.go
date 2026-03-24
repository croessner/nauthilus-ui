package db

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"nauthilus-ui/server/models"
)

// defaultTimeout is the default timeout for database operations.
const defaultTimeout = 10 * time.Second

func defaultSessionConfig(m *MongoDB) models.SessionConfig {
	return models.SessionConfig{
		TokenExpiry:        m.Config.TokenExpiry,
		RefreshTokenExpiry: m.Config.RefreshTokenExpiry,
		RememberMeExpiry:   m.Config.RememberMeExpiry,
	}
}

// GetSessionConfig retrieves the session configuration from the database.
func (m *MongoDB) GetSessionConfig() (*models.SessionConfig, error) {
	if !m.IsConnectedToMongoDB() {
		return nil, errors.New("not connected to MongoDB")
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
	defer cancel()

	var sessionConfig models.SessionConfig
	err := m.SessionConfigColl.FindOne(ctx, bson.M{}).Decode(&sessionConfig)
	if err == nil {
		return &sessionConfig, nil
	}

	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, err
	}

	sessionConfig = defaultSessionConfig(m)
	if _, err = m.SessionConfigColl.InsertOne(ctx, sessionConfig); err != nil {
		return nil, err
	}

	return &sessionConfig, nil
}

// UpdateSessionConfig replaces the persisted session configuration.
func (m *MongoDB) UpdateSessionConfig(config *models.SessionConfig) error {
	if !m.IsConnectedToMongoDB() {
		return errors.New("not connected to MongoDB")
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
	defer cancel()

	if _, err := m.SessionConfigColl.DeleteMany(ctx, bson.M{}); err != nil {
		return err
	}

	_, err := m.SessionConfigColl.InsertOne(ctx, config)
	return err
}

// GetUserByUsername retrieves a user by username.
func (m *MongoDB) GetUserByUsername(username string) (*models.User, error) {
	if !m.IsConnectedToMongoDB() {
		return nil, errors.New("not connected to MongoDB")
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
	defer cancel()

	type storedUser struct {
		Username        string                      `bson:"username"`
		PasswordHash    string                      `bson:"passwordHash"`
		Roles           []string                    `bson:"roles"`
		DisplayName     string                      `bson:"displayName,omitempty"`
		Email           string                      `bson:"email,omitempty"`
		Avatar          string                      `bson:"avatar,omitempty"`
		Enabled         *bool                       `bson:"enabled"`
		LastLogin       *string                     `bson:"lastLogin"`
		LastModified    string                      `bson:"lastModified"`
		TOTPEnabled     bool                        `bson:"totpEnabled"`
		TOTPSecret      string                      `bson:"totpSecret,omitempty"`
		WebAuthnEnabled bool                        `bson:"webAuthnEnabled"`
		WebAuthnDevices []models.WebAuthnCredential `bson:"webAuthnDevices,omitempty"`
	}

	var stored storedUser
	err := m.UserColl.FindOne(ctx, bson.M{"username": username}).Decode(&stored)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}

		return nil, err
	}

	enabled := true
	if stored.Enabled != nil {
		enabled = *stored.Enabled
	}

	return &models.User{
		Username:        stored.Username,
		PasswordHash:    stored.PasswordHash,
		Roles:           stored.Roles,
		DisplayName:     stored.DisplayName,
		Email:           stored.Email,
		Avatar:          stored.Avatar,
		Enabled:         enabled,
		LastLogin:       stored.LastLogin,
		LastModified:    stored.LastModified,
		TOTPEnabled:     stored.TOTPEnabled,
		TOTPSecret:      stored.TOTPSecret,
		WebAuthnEnabled: stored.WebAuthnEnabled,
		WebAuthnDevices: stored.WebAuthnDevices,
	}, nil
}
