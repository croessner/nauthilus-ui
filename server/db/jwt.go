package db

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"nauthilus-ui/server/models"
)

// defaultTimeout is the default timeout for database operations
const defaultTimeout = 10 * time.Second

// JWTConfig represents the JWT configuration stored in the database
type JWTConfig struct {
	Secret             string `bson:"jwtSecret" json:"-"`
	TokenExpiry        int    `bson:"tokenExpiry" json:"tokenExpiry"`
	RefreshTokenExpiry int    `bson:"refreshTokenExpiry" json:"refreshTokenExpiry"`
	RememberMeExpiry   int    `bson:"rememberMeExpiry" json:"rememberMeExpiry"`
}

// GetJWTConfig retrieves the JWT configuration from the database
func (m *MongoDB) GetJWTConfig() (*JWTConfig, error) {
	if !m.IsConnectedToMongoDB() {
		return nil, errors.New("not connected to MongoDB")
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
	defer cancel()

	var jwtConfig JWTConfig
	err := m.JWTConfigColl.FindOne(ctx, bson.M{}).Decode(&jwtConfig)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			// If no JWT config is found, create a default one from runtime config
			defaultConfig := JWTConfig{
				Secret:             m.Config.JWTSecret,
				TokenExpiry:        m.Config.TokenExpiry,
				RefreshTokenExpiry: m.Config.RefreshTokenExpiry,
				RememberMeExpiry:   m.Config.RememberMeExpiry,
			}

			_, err = m.JWTConfigColl.InsertOne(ctx, defaultConfig)
			if err != nil {
				return nil, err
			}

			return &defaultConfig, nil
		}

		return nil, err
	}

	return &jwtConfig, nil
}

// UpdateJWTConfig updates the JWT configuration in the database
func (m *MongoDB) UpdateJWTConfig(config *JWTConfig) error {
	if !m.IsConnectedToMongoDB() {
		return errors.New("not connected to MongoDB")
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
	defer cancel()

	// Delete all existing configs
	_, err := m.JWTConfigColl.DeleteMany(ctx, bson.M{})
	if err != nil {
		return err
	}

	// Insert the new config
	_, err = m.JWTConfigColl.InsertOne(ctx, config)

	return err
}

// GetUserByUsername retrieves a user by username
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
			return nil, nil // User not found
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
