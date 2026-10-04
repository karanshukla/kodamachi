package shim

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// ErrCacheMiss is returned when an entry is absent or expired.
var ErrCacheMiss = errors.New("cache miss")

// DefaultCacheMaxEntries caps the on-disk cache (~3.5GB worst case at ~350KB
// each, which the Railway volume is sized for).
const DefaultCacheMaxEntries = 10000

// FileCache is a DID-keyed, file-backed, LRU-bounded TTL cache for OG images.
// Each entry is <SafeDID>.png plus a <SafeDID>.meta mime sidecar.
//
// The two files carry separate clocks: .png ModTime is TTL freshness (written
// only by Store), .meta ModTime is LRU recency (touched on every hit).
// [TestFileCache_LoadDoesNotRefreshTTL], [TestFileCache_LoadByPathUpdatesLRURecency]
// and [TestFileCache_LoadByPathDoesNotRefreshTTL] pin that they stay separate.
type FileCache struct {
	dir        string
	MaxEntries int
	TTL        time.Duration

	mu sync.Mutex // guards the eviction bookkeeping
}

// NewFileCache opens or creates a cache rooted at dir. maxEntries <= 0 uses
// DefaultCacheMaxEntries.
func NewFileCache(dir string, maxEntries int, ttl time.Duration) (*FileCache, error) {
	if maxEntries <= 0 {
		maxEntries = DefaultCacheMaxEntries
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &FileCache{dir: dir, MaxEntries: maxEntries, TTL: ttl}, nil
}

func (c *FileCache) pngPath(did string) string {
	return filepath.Join(c.dir, SafeDID(did)+".png")
}

func (c *FileCache) metaPath(did string) string {
	return filepath.Join(c.dir, SafeDID(did)+".meta")
}

// Load returns the entry for did, or ErrCacheMiss if absent or past TTL.
func (c *FileCache) Load(did string) (*CacheEntry, error) {
	mod, ok := c.freshModTime(did)
	if !ok {
		return nil, ErrCacheMiss
	}
	bytes, err := os.ReadFile(c.pngPath(did))
	if err != nil {
		return nil, ErrCacheMiss
	}
	mime := c.readMeta(did)
	c.touchLRU(did)
	return &CacheEntry{Bytes: bytes, ModTime: mod, MimeType: mime}, nil
}

// Fresh is Load without reading the image bytes. [TestFileCache_FreshWithinTTL_ReportsTrue]
// and [TestFileCache_FreshPastTTL_ReportsFalse] pin that it agrees with Load
// across the TTL boundary; [TestFileCache_FreshDoesNotRefreshTTL] pins that
// probing does not extend an image's life.
func (c *FileCache) Fresh(did string) bool {
	if _, ok := c.freshModTime(did); !ok {
		return false
	}
	c.touchLRU(did)
	return true
}

// freshModTime returns the .png ModTime of a live entry; false if absent or expired.
func (c *FileCache) freshModTime(did string) (time.Time, bool) {
	info, err := os.Stat(c.pngPath(did))
	if err != nil {
		return time.Time{}, false
	}
	if c.TTL > 0 && time.Since(info.ModTime()) >= c.TTL {
		return time.Time{}, false
	}
	return info.ModTime(), true
}

// touchLRU bumps the .meta ModTime. A missing sidecar is ignored.
func (c *FileCache) touchLRU(did string) {
	now := time.Now()
	if err := os.Chtimes(c.metaPath(did), now, now); err != nil {
		// Soft signal: eviction falls back to the .png mtime.
		return
	}
}

// Store writes the image and mime type, then evicts down to MaxEntries. The
// image write is atomic; the .meta is not, and a torn one reads as image/png.
func (c *FileCache) Store(did string, bytes []byte, mimeType string) error {
	if did == "" {
		return errors.New("store: empty did")
	}
	finalPng := c.pngPath(did)
	if err := writeFileAtomic(finalPng, bytes, 0o644); err != nil {
		return err
	}
	if err := c.writeMeta(did, mimeType); err != nil {
		return err
	}
	c.evictIfNeeded()
	return nil
}

// writeFileAtomic writes via a temp file and rename, removing the temp on error.
func writeFileAtomic(dst string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(dst)
	tmp, err := os.CreateTemp(dir, ".tmp-og-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	cleanup := func() { _ = os.Remove(tmpName) }
	n, err := tmp.Write(data)
	if err == nil && n < len(data) {
		err = io.ErrShortWrite
	}
	if syncErr := tmp.Sync(); syncErr != nil && err == nil {
		err = syncErr
	}
	if closeErr := tmp.Close(); closeErr != nil && err == nil {
		err = closeErr
	}
	if err != nil {
		cleanup()
		return err
	}
	if err := os.Chmod(tmpName, perm); err != nil {
		cleanup()
		return err
	}
	if err := os.Rename(tmpName, dst); err != nil {
		cleanup()
		return err
	}
	return nil
}

func (c *FileCache) readMeta(did string) string {
	b, err := os.ReadFile(c.metaPath(did))
	if err != nil {
		return "image/png"
	}
	var m struct {
		MimeType string `json:"mimeType"`
	}
	if json.Unmarshal(b, &m) != nil {
		return "image/png"
	}
	if m.MimeType == "" {
		return "image/png"
	}
	return m.MimeType
}

func (c *FileCache) writeMeta(did, mimeType string) error {
	if mimeType == "" {
		mimeType = "image/png"
	}
	b, err := json.Marshal(struct {
		MimeType string `json:"mimeType"`
	}{MimeType: mimeType})
	if err != nil {
		return err
	}
	return os.WriteFile(c.metaPath(did), b, 0o644)
}

// Dir returns the cache root directory.
func (c *FileCache) Dir() string { return c.dir }

// SafePathFromBase sanitizes a request-supplied filename so it cannot leave
// the cache dir. Returns "" unless it is a .png.
func (c *FileCache) SafePathFromBase(base string) string {
	base = filepath.Clean("/" + base)
	base = filepath.Base(base)
	if base == "" || base == "." || base == "/" {
		return ""
	}
	if filepath.Ext(base) != ".png" {
		return ""
	}
	stem := strings.TrimSuffix(base, ".png")
	safe := SafeDID(stem)
	if safe == "" {
		return ""
	}
	return safe + ".png"
}

// LoadByPath loads the entry at an image path from SafePathFromBase, for the
// /og-cache/:did.png route.
func (c *FileCache) LoadByPath(p string) (*CacheEntry, error) {
	info, err := os.Stat(p)
	if err != nil {
		return nil, ErrCacheMiss
	}
	if c.TTL > 0 && time.Since(info.ModTime()) >= c.TTL {
		return nil, ErrCacheMiss
	}
	bytes, err := os.ReadFile(p)
	if err != nil {
		return nil, ErrCacheMiss
	}
	base := strings.TrimSuffix(filepath.Base(p), ".png")
	metaPath := filepath.Join(c.dir, base+".meta")
	mime := "image/png"
	if b, err := os.ReadFile(metaPath); err == nil {
		var m struct {
			MimeType string `json:"mimeType"`
		}
		if json.Unmarshal(b, &m) == nil && m.MimeType != "" {
			mime = m.MimeType
		}
	}
	now := time.Now()
	_ = os.Chtimes(metaPath, now, now)
	return &CacheEntry{Bytes: bytes, ModTime: info.ModTime(), MimeType: mime}, nil
}

// evictIfNeeded removes least-recently-used entries beyond MaxEntries, ordered
// by .meta ModTime (falling back to the .png's when it is missing).
func (c *FileCache) evictIfNeeded() {
	c.mu.Lock()
	defer c.mu.Unlock()

	type entry struct {
		name string
		mod  time.Time
	}
	entries, err := os.ReadDir(c.dir)
	if err != nil {
		return
	}
	// Drop orphaned sidecars, e.g. from a Store interrupted mid-write.
	metaMod := make(map[string]time.Time)
	pngStems := make(map[string]bool)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		switch filepath.Ext(name) {
		case ".png":
			pngStems[strings.TrimSuffix(name, ".png")] = true
		case ".meta":
			if info, err := e.Info(); err == nil {
				metaMod[strings.TrimSuffix(name, ".meta")] = info.ModTime()
			}
		}
	}
	for stem := range metaMod {
		if !pngStems[stem] {
			_ = os.Remove(filepath.Join(c.dir, stem+".meta"))
		}
	}
	var pngs []entry
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if filepath.Ext(name) != ".png" {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		stem := strings.TrimSuffix(name, ".png")
		recency, ok := metaMod[stem]
		if !ok || recency.IsZero() {
			recency = info.ModTime()
		}
		pngs = append(pngs, entry{name: name, mod: recency})
	}
	if len(pngs) <= c.MaxEntries {
		return
	}
	sort.Slice(pngs, func(i, j int) bool { return pngs[i].mod.Before(pngs[j].mod) })
	excess := len(pngs) - c.MaxEntries
	for i := 0; i < excess; i++ {
		base := strings.TrimSuffix(pngs[i].name, ".png")
		_ = os.Remove(filepath.Join(c.dir, pngs[i].name))
		_ = os.Remove(filepath.Join(c.dir, base+".meta"))
	}
}
