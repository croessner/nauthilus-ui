package db

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"nauthilus-ui/server/models"
)

// GetAllowedBackendOrigins returns the set of backend URL origins
// (scheme://host[:port]) that the given user has saved in their active
// RuntimeSettings.  The proxy handler compares incoming target URLs against
// this list to prevent SSRF.
//
// The returned slice contains at most one entry today (the single
// backend_url per profile), but is typed as []string so callers are not
// coupled to that assumption.
//
// Return values:
//   - (nil, err)    – database or configuration error; caller should log and fall back.
//   - ([]string{},  nil) – user exists but has no backend URL configured.
//   - ([]string{…}, nil) – one or more normalised origins.
func (m *MongoDB) GetAllowedBackendOrigins(ctx context.Context, username string) ([]string, error) {
	if !m.IsConnectedToMongoDB() {
		return nil, errors.New("not connected to MongoDB")
	}

	// 1. Resolve current profile name.
	var profile models.Profile

	err := m.ProfileColl.FindOne(ctx, bson.M{"userId": username}).Decode(&profile)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return []string{}, nil // no profile yet – allowlist is empty
		}

		return nil, fmt.Errorf("profile lookup failed: %w", err)
	}

	if profile.CurrentProfileName == "" {
		return []string{}, nil
	}

	// 2. Fetch the runtime settings for the active profile.
	var rt models.RuntimeSettings

	err = m.RuntimeColl.FindOne(ctx, bson.M{
		"userId":      username,
		"profileName": profile.CurrentProfileName,
	}).Decode(&rt)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return []string{}, nil
		}

		return nil, fmt.Errorf("runtime settings lookup failed: %w", err)
	}

	// 3. Extract backend_url from the connection map.
	backendURL, _ := rt.Connection["backend_url"].(string)
	if backendURL == "" {
		return []string{}, nil
	}

	// 4. Normalise to origin (scheme://host[:port]).
	parsed, err := url.Parse(backendURL)
	if err != nil {
		return nil, fmt.Errorf("invalid stored backend_url %q: %w", backendURL, err)
	}

	origin := strings.ToLower(parsed.Scheme) + "://" + strings.ToLower(parsed.Host)

	return []string{origin}, nil
}
