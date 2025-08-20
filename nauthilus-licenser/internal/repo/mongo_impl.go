package repo

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"nauthilus-licenser/internal/models"
)

type mongoKeyStore struct{ c *mongo.Collection }

type mongoUserRepo struct{ c *mongo.Collection }

type mongoSubRepo struct{ c *mongo.Collection }

type mongoLicenseRepo struct{ c *mongo.Collection }

type mongoRefreshRepo struct{ c *mongo.Collection }

type mongoBlacklistRepo struct{ c *mongo.Collection }

type mongoWebhookRepo struct{ c *mongo.Collection }

func NewMongoKeyStore(db *mongo.Database) KeyStore { return &mongoKeyStore{c: db.Collection("keys")} }
func NewUserRepository(db *mongo.Database) UserRepository { return &mongoUserRepo{c: db.Collection("users")} }
func NewSubscriptionRepository(db *mongo.Database) SubscriptionRepository { return &mongoSubRepo{c: db.Collection("subscriptions")} }
func NewLicenseRepository(db *mongo.Database) LicenseRepository { return &mongoLicenseRepo{c: db.Collection("licenses")} }
func NewRefreshTokenRepository(db *mongo.Database) RefreshTokenRepository { return &mongoRefreshRepo{c: db.Collection("refresh_tokens")} }
func NewTokenBlacklistRepository(db *mongo.Database) TokenBlacklistRepository {
	return &mongoBlacklistRepo{c: db.Collection("token_blacklist")}
}
func NewWebhookEventRepository(db *mongo.Database) WebhookEventRepository {
	return &mongoWebhookRepo{c: db.Collection("webhook_events")}
}

func (m *mongoKeyStore) GetActive(ctx context.Context) (*models.KeyPair, error) {
	var kp models.KeyPair
	err := m.c.FindOne(ctx, bson.M{"active": true}, options.FindOne().SetSort(bson.M{"createdAt": -1})).Decode(&kp)
	if err != nil {
		return nil, err
	}
	return &kp, nil
}
func (m *mongoKeyStore) GetAllActive(ctx context.Context) ([]models.KeyPair, error) {
	cur, err := m.c.Find(ctx, bson.M{"active": true})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []models.KeyPair
	for cur.Next(ctx) {
		var kp models.KeyPair
		if err := cur.Decode(&kp); err != nil {
			return nil, err
		}
		out = append(out, kp)
	}
	return out, nil
}
func (m *mongoKeyStore) Save(ctx context.Context, k models.KeyPair) error {
	_, err := m.c.InsertOne(ctx, k)
	return err
}
func (m *mongoKeyStore) Rotate(ctx context.Context, newKey models.KeyPair) error {
	_, err := m.c.UpdateMany(ctx, bson.M{"active": true}, bson.M{"$set": bson.M{"active": false, "rotatedAt": time.Now()}})
	if err != nil {
		return err
	}
	_, err = m.c.InsertOne(ctx, newKey)
	return err
}

func (m *mongoUserRepo) GetByID(ctx context.Context, id string) (*models.User, error) {
	var u models.User
	err := m.c.FindOne(ctx, bson.M{"_id": id}).Decode(&u)
	if err != nil {
		return nil, err
	}
	return &u, nil
}
func (m *mongoUserRepo) Upsert(ctx context.Context, u *models.User) error {
	u.UpdatedAt = time.Now()
	_, err := m.c.UpdateByID(ctx, u.ID, bson.M{"$set": u, "$setOnInsert": bson.M{"createdAt": time.Now()}} , options.Update().SetUpsert(true))
	return err
}

func (m *mongoSubRepo) GetByMollieID(ctx context.Context, mollieSubID string) (*models.Subscription, error) {
	var s models.Subscription
	err := m.c.FindOne(ctx, bson.M{"mollieSubscriptionId": mollieSubID}).Decode(&s)
	if err != nil {
		return nil, err
	}
	return &s, nil
}
func (m *mongoSubRepo) Upsert(ctx context.Context, s *models.Subscription) error {
	s.UpdatedAt = time.Now()
	filter := bson.M{"_id": s.ID}
	if s.ID == "" { // derive key
		filter = bson.M{"mollieSubscriptionId": s.MollieSubscription}
	}
	_, err := m.c.UpdateOne(ctx, filter, bson.M{"$set": s, "$setOnInsert": bson.M{"createdAt": time.Now()}} , options.Update().SetUpsert(true))
	return err
}

func (m *mongoLicenseRepo) GetByUser(ctx context.Context, userID string) (*models.License, error) {
	var l models.License
	err := m.c.FindOne(ctx, bson.M{"userId": userID}).Decode(&l)
	if err != nil {
		return nil, err
	}
	return &l, nil
}
func (m *mongoLicenseRepo) Upsert(ctx context.Context, l *models.License) error {
	_, err := m.c.UpdateOne(ctx, bson.M{"userId": l.UserID}, bson.M{"$set": l, "$setOnInsert": bson.M{"createdAt": time.Now()}} , options.Update().SetUpsert(true))
	return err
}

func (m *mongoRefreshRepo) Create(ctx context.Context, t *models.RefreshToken) error {
	_, err := m.c.InsertOne(ctx, t)
	return err
}
func (m *mongoRefreshRepo) GetByID(ctx context.Context, id string) (*models.RefreshToken, error) {
	var t models.RefreshToken
	err := m.c.FindOne(ctx, bson.M{"_id": id}).Decode(&t)
	if err != nil {
		return nil, err
	}
	return &t, nil
}
func (m *mongoRefreshRepo) Delete(ctx context.Context, id string) error {
	_, err := m.c.DeleteOne(ctx, bson.M{"_id": id})
	return err
}
func (m *mongoRefreshRepo) DeleteExpired(ctx context.Context, now time.Time) (int64, error) {
	res, err := m.c.DeleteMany(ctx, bson.M{"expiresAt": bson.M{"$lt": now}})
	if err != nil { return 0, err }
	return res.DeletedCount, nil
}

func (m *mongoBlacklistRepo) IsBlacklisted(ctx context.Context, jti string) (bool, error) {
	err := m.c.FindOne(ctx, bson.M{"jti": jti}).Err()
	if err == mongo.ErrNoDocuments { return false, nil }
	return err == nil, err
}
func (m *mongoBlacklistRepo) Add(ctx context.Context, tb *models.TokenBlacklist) error {
	_, err := m.c.InsertOne(ctx, tb)
	if mongo.IsDuplicateKeyError(err) {
		return nil
	}
	return err
}

func (m *mongoWebhookRepo) AlreadyProcessed(ctx context.Context, id string) (bool, error) {
	err := m.c.FindOne(ctx, bson.M{"_id": id}).Err()
	if err == mongo.ErrNoDocuments { return false, nil }
	return err == nil, err
}
func (m *mongoWebhookRepo) MarkProcessed(ctx context.Context, ev *models.WebhookEvent) error {
	if ev.ID == "" { return errors.New("missing event id") }
	_, err := m.c.InsertOne(ctx, ev)
	if mongo.IsDuplicateKeyError(err) { return nil }
	return err
}
