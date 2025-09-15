package api

import (
	"bytes"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// tokenBucket is a simple in-memory token bucket limiter.
type tokenBucket struct {
	capacity   float64
	ratePerSec float64
	tokens     float64
	lastRefill time.Time
}

// newTokenBucket initializes and returns a new tokenBucket with the given capacity and refill rate per second.
func newTokenBucket(capacity, ratePerSec float64) *tokenBucket {
	return &tokenBucket{
		capacity:   capacity,
		ratePerSec: ratePerSec,
		tokens:     capacity,
		lastRefill: time.Now(),
	}
}

// allowNow determines if a request can be allowed immediately based on the token bucket's current state and rate.
func (b *tokenBucket) allowNow() bool {
	now := time.Now()

	elapsed := now.Sub(b.lastRefill).Seconds()
	if elapsed > 0 {
		b.tokens = minFloat(b.capacity, b.tokens+elapsed*b.ratePerSec)
		b.lastRefill = now
	}

	if b.tokens >= 1 {
		b.tokens -= 1

		return true
	}

	return false
}

// minFloat returns the smaller of two float64 values, a or b.
func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}

	return b
}

// limiterEntry holds the state for a single key (e.g., an IP).
type limiterEntry struct {
	bucket           *tokenBucket
	consecutiveFails int
	nextAllowedAt    time.Time
	lastSeen         time.Time
}

// limiterStore keeps buckets and backoff state keyed by a string (IP/username).
type limiterStore struct {
	mu          sync.Mutex
	entries     map[string]*limiterEntry
	cap         float64
	rate        float64
	idleTTL     time.Duration
	baseBackoff time.Duration
	maxBackoff  time.Duration
}

// newLimiterStore initializes a limiterStore with specified capacity, rate, idle TTL, base backoff, and max backoff durations.
func newLimiterStore(capacity, ratePerSec float64, idleTTL, baseBackoff, maxBackoff time.Duration) *limiterStore {
	return &limiterStore{
		entries:     make(map[string]*limiterEntry),
		cap:         capacity,
		rate:        ratePerSec,
		idleTTL:     idleTTL,
		baseBackoff: baseBackoff,
		maxBackoff:  maxBackoff,
	}
}

// getEntry retrieves or initializes a limiterEntry for the given key, updating its last seen timestamp.
func (s *limiterStore) getEntry(key string) *limiterEntry {
	if e, ok := s.entries[key]; ok {
		e.lastSeen = time.Now()

		return e
	}

	e := &limiterEntry{
		bucket:   newTokenBucket(s.cap, s.rate),
		lastSeen: time.Now(),
	}

	s.entries[key] = e

	return e
}

// preCheck enforces adaptive backoff. Returns allowed and, if not allowed, the remaining delay.
func (s *limiterStore) preCheck(key string) (bool, time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()

	e := s.getEntry(key)

	now := time.Now()
	if now.Before(e.nextAllowedAt) {
		return false, e.nextAllowedAt.Sub(now)
	}

	return true, 0
}

// allow checks if the operation associated with the given key is permitted based on the token bucket rate limiter.
func (s *limiterStore) allow(key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	e := s.getEntry(key)

	return e.bucket.allowNow()
}

// recordFailure increments the failure counter and applies exponential backoff for a given key in the limiterStore.
func (s *limiterStore) recordFailure(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	e := s.getEntry(key)
	e.consecutiveFails++
	// Exponential backoff: base * 2^(n-1), capped at maxBackoff
	exp := math.Pow(2, float64(max(0, e.consecutiveFails-1)))

	delay := time.Duration(float64(s.baseBackoff) * exp)
	if delay > s.maxBackoff {
		delay = s.maxBackoff
	}

	e.nextAllowedAt = time.Now().Add(delay)
}

// recordSuccess resets the failure counter and backoff state for the given key in the limiterStore.
func (s *limiterStore) recordSuccess(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	e := s.getEntry(key)
	e.consecutiveFails = 0
	e.nextAllowedAt = time.Time{}
}

// prune removes idle entries from the limiterStore based on the configured idleTTL duration.
func (s *limiterStore) prune() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	for k, e := range s.entries {
		if now.Sub(e.lastSeen) > s.idleTTL {
			delete(s.entries, k)
		}
	}
}

var (
	// Default limiter stores for this process. Reset on process restart.
	loginIPLimiter = newLimiterStore(10, 10.0/60.0, 20*time.Minute, 1*time.Second, 30*time.Second) // 10 req/min/IP, adaptive backoff 1s..30s
	mfaIPLimiter   = newLimiterStore(15, 15.0/60.0, 20*time.Minute, 500*time.Millisecond, 15*time.Second)

	reaperOnce sync.Once

	// reCAPTCHA config cache
	recaptchaOnce   sync.Once
	recaptchaConfig recaptchaCfg
)

// startReaper starts a background goroutine to prune idle entries.
func startReaper() {
	reaperOnce.Do(func() {
		go func() {
			t := time.NewTicker(1 * time.Minute)
			defer t.Stop()

			for range t.C {
				if loginIPLimiter != nil {
					loginIPLimiter.prune()
				}

				if mfaIPLimiter != nil {
					mfaIPLimiter.prune()
				}
			}
		}()
	})
}

// RateLimitByIP returns a middleware that rate-limits and adaptively delays by client IP.
func RateLimitByIP(store *limiterStore) gin.HandlerFunc {
	startReaper()
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if ip == "" {
			ip = "unknown"
		}

		// Adaptive backoff gate: if recent failures occurred, enforce retry-after window
		if ok, wait := store.preCheck(ip); !ok {
			c.Header("Retry-After", strconv.Itoa(int(wait.Seconds()+0.5)))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "Too many attempts, please retry later"})

			return
		}

		// Token-bucket rate limiting
		if !store.allow(ip) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "Too many requests"})

			return
		}

		c.Next()

		// After handler: update backoff state based on result
		status := c.Writer.Status()
		if status == http.StatusUnauthorized || status == http.StatusForbidden {
			store.recordFailure(ip)
		} else if status >= 200 && status < 300 {
			store.recordSuccess(ip)
		}
	}
}

// LoginRateLimitMiddleware limits brute force attempts on the password login endpoint by IP.
func LoginRateLimitMiddleware() gin.HandlerFunc {
	return RateLimitByIP(loginIPLimiter)
}

// MFARateLimitMiddleware limits MFA endpoints by IP.
func MFARateLimitMiddleware() gin.HandlerFunc {
	return RateLimitByIP(mfaIPLimiter)
}

// reCAPTCHA support and adaptive middleware

type recaptchaCfg struct {
	Enabled  bool
	Secret   string
	SiteKey  string
	MinScore float64
	// Threshold of consecutive failures before CAPTCHA is required
	Threshold int
}

func loadRecaptchaConfig() recaptchaCfg {
	recaptchaOnce.Do(func() {
		secret := os.Getenv("RECAPTCHA_SECRET")
		siteKey := os.Getenv("RECAPTCHA_SITE_KEY")
		minScoreStr := os.Getenv("RECAPTCHA_MIN_SCORE")
		thresholdStr := os.Getenv("RECAPTCHA_THRESHOLD")

		cfg := recaptchaCfg{Enabled: false, Secret: secret, SiteKey: siteKey, MinScore: 0.0, Threshold: 3}
		if minScoreStr != "" {
			if v, err := strconv.ParseFloat(minScoreStr, 64); err == nil {
				cfg.MinScore = v
			}
		}

		if thresholdStr != "" {
			if v, err := strconv.Atoi(thresholdStr); err == nil && v > 0 {
				cfg.Threshold = v
			}
		}

		if secret != "" && siteKey != "" {
			cfg.Enabled = true
		}

		recaptchaConfig = cfg
	})

	return recaptchaConfig
}

// site verify response
type recaptchaResp struct {
	Success     bool     `json:"success"`
	Score       float64  `json:"score"`
	ErrorCodes  []string `json:"error-codes"`
	ChallengeTS string   `json:"challenge_ts"`
	Hostname    string   `json:"hostname"`
	Action      string   `json:"action"`
}

// verifyRecaptcha posts token to Google and returns ok, score, reason
func verifyRecaptcha(token, remoteIP string) (bool, float64, string) {
	cfg := loadRecaptchaConfig()
	if !cfg.Enabled || token == "" {
		return false, 0, "captcha_not_configured_or_empty_token"
	}
	form := url.Values{}
	form.Set("secret", cfg.Secret)
	form.Set("response", token)
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}
	resp, err := http.PostForm("https://www.google.com/recaptcha/api/siteverify", form)
	if err != nil {
		return false, 0, "captcha_verify_request_failed"
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	var vr recaptchaResp
	_ = json.Unmarshal(b, &vr)
	if !vr.Success {
		return false, vr.Score, strings.Join(vr.ErrorCodes, ",")
	}
	// If score exists (v3), enforce minimum if configured (>0)
	if vr.Score > 0 && cfg.MinScore > 0 && vr.Score < cfg.MinScore {
		return false, vr.Score, "low_score"
	}
	return true, vr.Score, ""
}

// getConsecutiveFails returns current consecutive failure count for key without mutating state
func (s *limiterStore) getConsecutiveFails(key string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.getEntry(key)
	return e.consecutiveFails
}

// AdaptiveCaptchaMiddleware enforces reCAPTCHA only after repeated failures from same IP
func AdaptiveCaptchaMiddleware(store *limiterStore) gin.HandlerFunc {
	cfg := loadRecaptchaConfig()
	if !cfg.Enabled {
		// no-op middleware
		return func(c *gin.Context) { c.Next() }
	}
	return func(c *gin.Context) {
		ip := c.ClientIP()
		fails := store.getConsecutiveFails(ip)
		threshold := loadRecaptchaConfig().Threshold
		if fails < threshold {
			c.Next()
			return
		}

		// Only enforce CAPTCHA for JSON bodies to avoid breaking non-JSON endpoints
		ct := c.Request.Header.Get("Content-Type")
		if !strings.Contains(ct, "application/json") {
			c.Next()
			return
		}

		// Read and restore body
		bodyBytes, _ := io.ReadAll(c.Request.Body)
		_ = c.Request.Body.Close()
		c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

		var tmp struct {
			RecaptchaToken string `json:"recaptchaToken"`
		}
		_ = json.Unmarshal(bodyBytes, &tmp)
		if tmp.RecaptchaToken == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":            "Captcha required",
				"captchaRequired":  true,
				"recaptchaSiteKey": loadRecaptchaConfig().SiteKey,
			})
			return
		}

		if ok, _, _ := verifyRecaptcha(tmp.RecaptchaToken, ip); !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":            "Captcha verification failed",
				"captchaRequired":  true,
				"recaptchaSiteKey": loadRecaptchaConfig().SiteKey,
			})
			return
		}

		// Restore body for downstream
		c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
		c.Next()
	}
}
