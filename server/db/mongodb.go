package db

import (
	"context"
	"log/slog"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"

	"nauthilus-ui/server/config"
	"nauthilus-ui/server/models"
)

// UserDatabase defines the interface for database operations needed by the UserHandler
type UserDatabase interface {
	// IsConnectedToMongoDB returns true if the database is connected
	IsConnectedToMongoDB() bool
	// GetUserCollection returns the user collection
	GetUserCollection() *mongo.Collection

	// SetCancelFunc sets a context.CancelFunc to be invoked for canceling ongoing database operations.
	SetCancelFunc(context.CancelFunc)
}

// MongoDB connection retry constants
const (
	// maxRetryCount is the maximum number of consecutive connection retry attempts
	maxRetryCount = 5
	// retryInterval is the time to wait between retry attempts
	retryInterval = 30 * time.Second
	// longRetryInterval is the time to wait after maxRetryCount attempts have failed
	longRetryInterval = 5 * time.Minute
)

// MongoDB represents a MongoDB connection
type MongoDB struct {
	Client        *mongo.Client
	DB            *mongo.Database
	ProfileColl   *mongo.Collection
	UserColl      *mongo.Collection
	JWTConfigColl *mongo.Collection
	RuntimeColl   *mongo.Collection
	LegalColl     *mongo.Collection
	AuditColl     *mongo.Collection
	Config        *config.Config
	RetryCount    int
	IsConnected   bool
	CancelFunc    context.CancelFunc
}

// NewMongoDB creates a new MongoDB connection
func NewMongoDB(cfg *config.Config) *MongoDB {
	return &MongoDB{
		Config:      cfg,
		IsConnected: false,
		RetryCount:  0,
	}
}

// Connect connects to MongoDB
func (m *MongoDB) Connect(ctx context.Context) error {
	slog.Info("Attempting to connect to MongoDB", "attempt", m.RetryCount+1, "maxAttempts", maxRetryCount+1)

	clientOptions := options.Client().
		ApplyURI(m.Config.MongoURI).
		SetServerSelectionTimeout(5 * time.Second).
		SetConnectTimeout(10 * time.Second).
		SetSocketTimeout(45 * time.Second)

	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		m.IsConnected = false

		return err
	}

	// Ping the database to verify connection
	err = client.Ping(ctx, nil)
	if err != nil {
		m.IsConnected = false

		return err
	}

	m.Client = client
	m.DB = client.Database("nauthilus-ui")
	m.ProfileColl = m.DB.Collection("profiles")
	m.UserColl = m.DB.Collection("users")
	m.JWTConfigColl = m.DB.Collection("jwtconfig")
	m.RuntimeColl = m.DB.Collection("runtime")
	m.LegalColl = m.DB.Collection("legal")
	m.AuditColl = m.DB.Collection("auditlog")
	m.IsConnected = true
	m.RetryCount = 0

	slog.Info("Connected to MongoDB")

	// Initialize collections and create default admin user if needed
	if err := m.InitializeDatabase(ctx); err != nil {
		slog.Error("Error initializing database", "error", err)
	}

	return nil
}

// Disconnect disconnects from MongoDB
func (m *MongoDB) Disconnect(ctx context.Context) error {
	if m.Client != nil {
		return m.Client.Disconnect(ctx)
	}

	return nil
}

// InitializeDatabase initializes the database with required collections and default data
func (m *MongoDB) InitializeDatabase(ctx context.Context) error {
	// Initialize JWT configuration
	if err := m.initializeJWTConfig(ctx); err != nil {
		return err
	}

	// Initialize default admin user
	if err := m.initializeDefaultUser(ctx); err != nil {
		return err
	}

	// Initialize default profile
	if err := m.initializeDefaultProfile(ctx); err != nil {
		return err
	}

	// Initialize runtime collection
	if err := m.initializeRuntimeCollection(ctx); err != nil {
		return err
	}

	// Initialize legal pages
	if err := m.initializeLegalPages(ctx); err != nil {
		return err
	}

	// Initialize audit collection indexes (non-fatal)
	if err := m.initializeAuditCollection(ctx); err != nil {
		slog.Warn("Audit collection initialization failed", "error", err)
	}

	slog.Info("Database initialization completed")

	return nil
}

// initializeJWTConfig creates the default JWT configuration if it doesn't exist
func (m *MongoDB) initializeJWTConfig(ctx context.Context) error {
	// Check if JWTConfig collection has any documents
	jwtConfigCount, err := m.JWTConfigColl.CountDocuments(ctx, bson.M{})
	if err != nil {
		return err
	}

	if jwtConfigCount == 0 {
		slog.Info("Creating default JWT configuration...")

		// Default JWT configuration
		jwtConfig := models.JWTConfig{
			JWTSecret:          m.Config.JWTSecret,
			TokenExpiry:        m.Config.TokenExpiry,
			RefreshTokenExpiry: m.Config.RefreshTokenExpiry,
			RememberMeExpiry:   m.Config.RememberMeExpiry,
		}

		_, err := m.JWTConfigColl.InsertOne(ctx, jwtConfig)
		if err != nil {
			return err
		}

		slog.Info("Default JWT configuration created successfully")
	} else {
		// Optional startup sync: update RememberMeExpiry from env if flag enabled and value differs.
		if m.Config.SyncRememberMeFromEnvOnBoot {
			var current models.JWTConfig
			findErr := m.JWTConfigColl.FindOne(ctx, bson.M{}).Decode(&current)
			if findErr != nil {
				return findErr
			}

			if current.RememberMeExpiry != m.Config.RememberMeExpiry && m.Config.RememberMeExpiry > 0 {
				filter := bson.M{"rememberMeExpiry": current.RememberMeExpiry}
				update := bson.M{"$set": bson.M{"rememberMeExpiry": m.Config.RememberMeExpiry}}

				res, updErr := m.JWTConfigColl.UpdateOne(ctx, filter, update)
				if updErr != nil {
					return updErr
				}

				if res.MatchedCount > 0 {
					slog.Info("Synchronized JWT rememberMeExpiry from env on boot", "old", current.RememberMeExpiry, "new", m.Config.RememberMeExpiry)
				} else {
					// Likely another instance updated first; log at debug/info and continue
					slog.Info("rememberMeExpiry sync skipped; configuration changed concurrently")
				}
			} else {
				slog.Debug("rememberMeExpiry already matches env or env value not positive; no sync performed")
			}
		} else {
			// Flag not enabled; optionally log if mismatch for operator visibility
			var current models.JWTConfig

			if err := m.JWTConfigColl.FindOne(ctx, bson.M{}).Decode(&current); err == nil {
				if current.RememberMeExpiry != m.Config.RememberMeExpiry {
					slog.Info("JWT rememberMeExpiry differs from env; set JWT_SYNC_FROM_ENV_ON_BOOT=true to sync on boot", "db", current.RememberMeExpiry, "env", m.Config.RememberMeExpiry)
				}
			}
		}
	}

	return nil
}

// initializeDefaultUser creates the default admin user if it doesn't exist
func (m *MongoDB) initializeDefaultUser(ctx context.Context) error {
	// Check if User collection has any documents
	userCount, err := m.UserColl.CountDocuments(ctx, bson.M{})
	if err != nil {
		return err
	}

	if userCount == 0 {
		slog.Info("Creating default admin user...")

		// Hash password
		passwordHash, err := bcrypt.GenerateFromPassword([]byte("admin"), 12)
		if err != nil {
			return err
		}

		// Default admin user
		adminUser := models.User{
			Username:     "admin",
			PasswordHash: string(passwordHash),
			Roles:        []string{"admin"},
			Enabled:      true,
			LastLogin:    nil,
			LastModified: time.Now().Format(time.RFC3339),
		}

		_, err = m.UserColl.InsertOne(ctx, adminUser)
		if err != nil {
			return err
		}

		slog.Info("Default admin user created successfully")
	}

	return nil
}

// initializeDefaultProfile creates the default profile if it doesn't exist
func (m *MongoDB) initializeDefaultProfile(ctx context.Context) error {
	// Check if Profile collection has any documents
	profileCount, err := m.ProfileColl.CountDocuments(ctx, bson.M{})
	if err != nil {
		return err
	}

	if profileCount == 0 {
		slog.Info("Creating default profile...")

		// Default empty configuration
		defaultConfig := map[string]interface{}{
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
					"enabled":       false,
					"client_id":     "",
					"client_secret": "",
					"scope":         "nauthilus:authenticate nauthilus:security",
					"token":         "",
					"expires_at":    0,
				},
			},
		}

		// Create default profile
		defaultProfile := models.Profile{
			UserID: "default-user",
			Profiles: []models.ProfileData{
				{
					Name:   "Default",
					Config: defaultConfig,
				},
			},
			CurrentProfileName: "Default",
		}

		_, err = m.ProfileColl.InsertOne(ctx, defaultProfile)
		if err != nil {
			return err
		}

		slog.Info("Default profile created successfully")
	}

	return nil
}

// initializeRuntimeCollection ensures the runtime collection exists
func (m *MongoDB) initializeRuntimeCollection(ctx context.Context) error {
	// Check if Runtime collection has any documents
	runtimeCount, err := m.RuntimeColl.CountDocuments(ctx, bson.M{})
	if err != nil {
		return err
	}

	slog.Info("Runtime collection initialized", "documents", runtimeCount)
	return nil
}

// initializeLegalPages creates default legal pages if they don't exist
func (m *MongoDB) initializeLegalPages(ctx context.Context) error {
	// Check if collection is empty
	count, err := m.LegalColl.CountDocuments(ctx, bson.M{})
	if err != nil {
		return err
	}

	if count == 0 {
		slog.Info("Creating default legal pages...")
		now := time.Now().Format(time.RFC3339)
		pages := []interface{}{
			bson.M{"key": "imprint", "title": "Imprint", "contentMd": "", "updatedAt": now, "updatedBy": "system"},
			bson.M{"key": "privacy", "title": "Privacy Policy", "contentMd": "", "updatedAt": now, "updatedBy": "system"},
		}

		if _, err := m.LegalColl.InsertMany(ctx, pages); err != nil {
			return err
		}

		slog.Info("Default legal pages created")
	}

	return nil
}

// RetryConnection retries the MongoDB connection
func (m *MongoDB) RetryConnection(ctx context.Context, isInitialAttempt bool) {
	if isInitialAttempt {
		m.RetryCount = 0
	}

	defer m.CancelFunc()

	err := m.Connect(ctx)
	if err != nil {
		slog.Error("MongoDB connection error", "error", err)
		m.IsConnected = false

		// Don't terminate the application, but make it clear there's a DB issue
		slog.Warn("Application running without database connection. Collections will not be created.")

		// Retry connection if we haven't exceeded the maximum retry count
		if m.RetryCount < maxRetryCount {
			m.RetryCount++
			slog.Info("Will retry MongoDB connection", "seconds", retryInterval/time.Second)
			time.AfterFunc(retryInterval, func() {
				m.RetryConnection(ctx, false)
			})
		} else {
			slog.Info("Maximum MongoDB connection retry attempts reached", "attempts", maxRetryCount+1, "nextRetryMinutes", longRetryInterval/time.Minute)
			// Schedule a long-term retry
			time.AfterFunc(longRetryInterval, func() {
				m.RetryConnection(ctx, true)
			})
		}
	}
}

// IsConnectedToMongoDB returns true if the database is connected
func (m *MongoDB) IsConnectedToMongoDB() bool {
	return m.IsConnected
}

// GetUserCollection returns the user collection
func (m *MongoDB) GetUserCollection() *mongo.Collection {
	return m.UserColl
}

// GetAuditCollection returns the audit log collection
func (m *MongoDB) GetAuditCollection() *mongo.Collection {
	return m.AuditColl
}

func (m *MongoDB) SetCancelFunc(cancelFunc context.CancelFunc) {
	m.CancelFunc = cancelFunc
}

// initializeAuditCollection creates indexes helpful for queries
func (m *MongoDB) initializeAuditCollection(ctx context.Context) error {
	if m.AuditColl == nil {
		return nil
	}

	// Index on timestamp desc and actor/action for filters
	_, err := m.AuditColl.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "ts", Value: -1}}},
		{Keys: bson.D{{Key: "actor", Value: 1}}},
		{Keys: bson.D{{Key: "action", Value: 1}}},
	})

	return err
}

// DeleteOldAuditLogs deletes audit log documents older than the provided cutoff time.
// Note: "ts" is stored as an RFC3339 string. Because all entries are written with the same
// server time format, lexicographic comparison with the same format works for range queries.
func (m *MongoDB) DeleteOldAuditLogs(ctx context.Context, olderThan time.Time) (int64, error) {
	if m.AuditColl == nil {
		return 0, nil
	}

	cutoff := olderThan.Format(time.RFC3339)

	res, err := m.AuditColl.DeleteMany(ctx, bson.M{"ts": bson.M{"$lt": cutoff}})
	if err != nil {
		return 0, err
	}

	return res.DeletedCount, nil
}
