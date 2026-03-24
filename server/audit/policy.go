package audit

import (
	"log/slog"
	"regexp"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/config"
	"nauthilus-ui/server/models"
)

// Policy provides a minimal server-side audit decision with optional deduplication.
// Default behavior:
// - Do not audit idempotent GET/HEAD requests unless forced by regex.
// - Audit mutating methods (POST/PUT/PATCH/DELETE) by default.
// - Optional dedup window suppresses repeated identical events per actor within N seconds.

type policy struct {
	allowGet    bool
	dedupWindow time.Duration
	forceRegex  *regexp.Regexp
	lastByKey   sync.Map // key(string) -> time.Time
}

var current *policy

// Init initializes the audit policy from config.
func Init(cfg *config.Config) {
	var re *regexp.Regexp
	if cfg.Audit.Policy.ForcePathRegex != "" {
		if compiled, err := regexp.Compile(cfg.Audit.Policy.ForcePathRegex); err != nil {
			slog.Error("Invalid audit.policy.force_path_regex; ignoring", "error", err)
		} else {
			re = compiled
		}
	}

	current = &policy{
		allowGet:    cfg.Audit.Policy.IncludeGetRequests,
		dedupWindow: time.Duration(cfg.Audit.Policy.DedupWindowSeconds) * time.Second,
		forceRegex:  re,
	}
}

func getPolicy() *policy {
	if current == nil {
		// Safe default if Init was not called
		current = &policy{allowGet: false, dedupWindow: 30 * time.Second}
	}

	return current
}

// shouldAudit decides whether to write the given audit entry.
// It also updates the internal dedup cache when it allows auditing.
func shouldAudit(p *policy, ctx *gin.Context, entry *models.AuditLogEntry) bool {
	path := ""
	if ctx != nil && ctx.Request != nil && ctx.Request.URL != nil {
		path = ctx.Request.URL.Path
	}

	method := entry.Method
	if method == "" && ctx != nil && ctx.Request != nil {
		method = ctx.Request.Method
	}

	// Force audit if regex matches path
	if p.forceRegex != nil && p.forceRegex.MatchString(path) {
		return true
	}

	switch method {
	case "GET", "HEAD":
		if !p.allowGet {
			return false
		}
	}

	// Dedup logic: if window set and same (actor, method, path, action, target) seen within window, suppress
	if p.dedupWindow > 0 {
		actor := entry.Actor
		key := actor + "|" + method + "|" + path + "|" + entry.Action + "|" + entry.Target

		if v, ok := p.lastByKey.Load(key); ok {
			if last, ok2 := v.(time.Time); ok2 {
				if time.Since(last) < p.dedupWindow {
					return false
				}
			}
		}

		p.lastByKey.Store(key, time.Now())
	}

	return true
}

// ShouldAudit is the exported helper used by api.WriteAudit.
func ShouldAudit(ctx *gin.Context, entry *models.AuditLogEntry) bool {
	return shouldAudit(getPolicy(), ctx, entry)
}
