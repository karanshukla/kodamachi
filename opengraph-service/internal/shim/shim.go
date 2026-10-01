// Package shim holds the opengraph-service's request classification, cache,
// rendering and HTTP handler.
package shim

import (
	"strings"
	"time"
)

// CardybUA is the Bluesky link-preview crawler's user agent. Mirrors
// anubis/botPolicy.json's allowlist entry.
const CardybUA = "Bluesky Cardyb"

// Decision classifies a request for the hot path.
type Decision int

const (
	DecisionProxy    Decision = iota // pass through to the client unchanged
	DecisionGenerate                 // synthesize a per-profile OG response
)

// Classify returns DecisionGenerate only for the Cardyb UA on a profile path;
// everything else proxies.
func Classify(userAgent, path string) Decision {
	if !isCardyb(userAgent) {
		return DecisionProxy
	}
	if !isProfilePath(path) {
		return DecisionProxy
	}
	return DecisionGenerate
}

// ProfilePathPrefix is the client route a link preview points at.
const ProfilePathPrefix = "/profile/"

// ProfileHandle extracts the :handle from a /profile/:handle path, or "" if
// the path does not match.
func ProfileHandle(path string) string { return handleAfterPrefix(path, ProfilePathPrefix) }

// WarmHandle extracts the :handle from an /og-warm/:handle path, or "" if the
// path does not match — the warm route's counterpart to ProfileHandle.
func WarmHandle(path string) string { return handleAfterPrefix(path, WarmPathPrefix) }

// handleAfterPrefix returns the single path segment after prefix, or "". Query
// strings and a trailing slash are ignored.
func handleAfterPrefix(path, prefix string) string {
	if !strings.HasPrefix(path, prefix) {
		return ""
	}
	rest := strings.TrimPrefix(path, prefix)
	if rest == "" {
		return ""
	}
	if i := strings.IndexByte(rest, '?'); i >= 0 {
		rest = rest[:i]
	}
	rest = strings.TrimSuffix(rest, "/")
	if rest == "" {
		return ""
	}
	// [TestProfileHandle_NestedPath_Empty] pins that /profile/a/b carries no handle.
	if strings.Contains(rest, "/") {
		return ""
	}
	return rest
}

func isCardyb(userAgent string) bool {
	return strings.Contains(userAgent, CardybUA)
}

func isProfilePath(path string) bool {
	return ProfileHandle(path) != ""
}

// CacheEntry is a stored generated image and its metadata.
type CacheEntry struct {
	Bytes    []byte
	ModTime  time.Time
	MimeType string
}

// IsFresh reports whether the entry is within ttl of now. A missing entry
// (ModTime zero) is never fresh.
func (e *CacheEntry) IsFresh(now time.Time, ttl time.Duration) bool {
	if e == nil || e.ModTime.IsZero() {
		return false
	}
	return now.Sub(e.ModTime) < ttl
}

// ParseTTL parses a duration like "720h", returning fallback when it is empty,
// invalid or non-positive.
func ParseTTL(s string, fallback time.Duration) time.Duration {
	if s == "" {
		return fallback
	}
	d, err := time.ParseDuration(s)
	if err != nil || d <= 0 {
		return fallback
	}
	return d
}
