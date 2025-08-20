package config

import (
	"os"
)

type Config struct {
	Addr         string
	MongoURI     string
	MongoDBName  string
	MollieAPIKey string
	Issuer       string
	AdminAPIKey  string
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func Load() Config {
	return Config{
		Addr:         getenv("LICENSE_ADDR", ":8080"),
		MongoURI:     getenv("MONGODB_URI", "mongodb://localhost:27017"),
		MongoDBName:  getenv("MONGODB_DB", "nauthilus_licenser"),
		MollieAPIKey: getenv("MOLLIE_API_KEY", ""),
		Issuer:       getenv("LICENSE_ISSUER", "http://localhost:8080"),
		AdminAPIKey:  getenv("ADMIN_API_KEY", ""),
	}
}
