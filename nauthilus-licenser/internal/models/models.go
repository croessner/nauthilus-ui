package models

import "time"

type User struct {
	ID        string    `bson:"_id" json:"id"`
	Email     string    `bson:"email" json:"email"`
	Status    string    `bson:"status" json:"status"`
	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time `bson:"updatedAt" json:"updatedAt"`
}

type Subscription struct {
	ID                 string    `bson:"_id" json:"id"`
	UserID             string    `bson:"userId" json:"userId"`
	MollieCustomerID   string    `bson:"mollieCustomerId" json:"mollieCustomerId"`
	MollieSubscription string    `bson:"mollieSubscriptionId" json:"mollieSubscriptionId"`
	PlanID             string    `bson:"planId" json:"planId"`
	Status             string    `bson:"status" json:"status"`
	CurrentPeriodEnd   time.Time `bson:"currentPeriodEnd" json:"currentPeriodEnd"`
	CreatedAt          time.Time `bson:"createdAt" json:"createdAt"`
	UpdatedAt          time.Time `bson:"updatedAt" json:"updatedAt"`
}

type License struct {
	UserID       string    `bson:"userId" json:"userId"`
	Download     bool      `bson:"download" json:"download"`
	Runtime      bool      `bson:"runtime" json:"runtime"`
	ValidUntil   time.Time `bson:"validUntil" json:"validUntil"`
	LastIssuedAt time.Time `bson:"lastIssuedAt" json:"lastIssuedAt"`
	Source       string    `bson:"source" json:"source"`
}

type KeyPair struct {
	KID        string    `bson:"kid" json:"kid"`
	PublicPEM  []byte    `bson:"publicPem" json:"-"`
	PrivatePEM []byte    `bson:"privatePem" json:"-"`
	Active     bool      `bson:"active" json:"active"`
	CreatedAt  time.Time `bson:"createdAt" json:"createdAt"`
	RotatedAt  time.Time `bson:"rotatedAt" json:"rotatedAt"`
}

type TokenBlacklist struct {
	JTI       string    `bson:"jti" json:"jti"`
	Reason    string    `bson:"reason" json:"reason"`
	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
}

type WebhookEvent struct {
	ID            string    `bson:"_id" json:"id"` // resource ID or hash
	ResourceID    string    `bson:"resourceId" json:"resourceId"`
	Type          string    `bson:"type" json:"type"`
	ProcessedAt   time.Time `bson:"processedAt" json:"processedAt"`
	Result        string    `bson:"result" json:"result"`
	RawPayloadSum string    `bson:"rawPayloadHash" json:"rawPayloadHash"`
}

type RefreshToken struct {
	ID        string    `bson:"_id" json:"id"`
	UserID    string    `bson:"userId" json:"userId"`
	Hash      string    `bson:"hash" json:"-"`
	ExpiresAt time.Time `bson:"expiresAt" json:"expiresAt"`
	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
}
