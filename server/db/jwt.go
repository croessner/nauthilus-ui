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
	Secret             string `bson:"secret" json:"secret"`
	TokenExpiry        int    `bson:"tokenExpiry" json:"tokenExpiry"`
	RefreshTokenExpiry int    `bson:"refreshTokenExpiry" json:"refreshTokenExpiry"`
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
			// If no JWT config is found, create a default one
			defaultConfig := JWTConfig{
				Secret:             "default-jwt-secret-please-change-in-production",
				TokenExpiry:        3600,  // 1 hour
				RefreshTokenExpiry: 86400, // 24 hours
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

	var user models.User
	err := m.UserColl.FindOne(ctx, bson.M{"username": username}).Decode(&user)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil // User not found
		}

		return nil, err
	}

	return &user, nil
}
