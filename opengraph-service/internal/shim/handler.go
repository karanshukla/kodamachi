package shim

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Handler is the opengraph-service's HTTP entry point.
type Handler struct {
	Proxy     http.Handler
	Generator *Generator
	Cache     *FileCache
	Origin    string // public site origin for absolute OG URLs
	// GenTimeout bounds one background render. Zero means DefaultGenTimeout.
	GenTimeout time.Duration
	// MaxConcurrentGenerate caps in-flight renders; excess ones are dropped.
	// Zero means DefaultMaxConcurrentGenerate; negative disables the cap.
	MaxConcurrentGenerate int
	// PendingRenderWait bounds how long an /og-cache/ request parks on an
	// in-flight render. Zero means DefaultPendingRenderWait; negative disables it.
	PendingRenderWait time.Duration
	// BackgroundCtx scopes fire-and-forget renders; nil means context.Background().
	BackgroundCtx context.Context

	genSem     chan struct{}
	background sync.WaitGroup
	pending    pendingRenders
}

// DefaultMaxConcurrentGenerate protects a single html-to-image instance.
const DefaultMaxConcurrentGenerate = 4

// DefaultGenTimeout bounds one background render when GenTimeout is unset.
const DefaultGenTimeout = 45 * time.Second

// DefaultPendingRenderWait is deliberately short: it holds the crawler's
// connection, and Cardyb fetches the image once, so overrunning its timeout is
// worse than serving the fallback.
const DefaultPendingRenderWait = 3 * time.Second

// Route prefixes matched before Classify.
const (
	// OGCachePathPrefix serves the stored PNG a generated og:image points at.
	OGCachePathPrefix = "/og-cache/"
	// WarmPathPrefix accepts POST /og-warm/:handle from the client's share intent.
	WarmPathPrefix = "/og-warm/"
)

// The fallback is no-store so a consumer that asks again is not pinned to the
// generic card.
const (
	renderedImageCacheControl = "public, max-age=86400"
	fallbackImageCacheControl = "no-store"
)

// NewHandler wires the handler against the client's base URL. A schemeless
// upstreamURL (e.g. "client:3000") is treated as http://, which Railway
// private-network URLs commonly omit.
func NewHandler(upstreamURL string, gen *Generator, cache *FileCache, origin string) (*Handler, error) {
	if !strings.Contains(upstreamURL, "://") {
		upstreamURL = "http://" + upstreamURL
	}
	target, err := url.Parse(upstreamURL)
	if err != nil {
		return nil, err
	}
	proxy, err := newCaddyProxy(target)
	if err != nil {
		return nil, err
	}
	h := &Handler{
		Proxy:                 proxy,
		Generator:             gen,
		Cache:                 cache,
		Origin:                origin,
		GenTimeout:            DefaultGenTimeout,
		MaxConcurrentGenerate: DefaultMaxConcurrentGenerate,
	}
	h.initSem()
	return h, nil
}

// initSem (re)builds the generate semaphore from MaxConcurrentGenerate; tests
// call it after overriding the cap.
func (h *Handler) initSem() {
	if h.MaxConcurrentGenerate < 0 {
		h.genSem = nil
		return
	}
	if h.MaxConcurrentGenerate == 0 {
		h.MaxConcurrentGenerate = DefaultMaxConcurrentGenerate
	}
	h.genSem = make(chan struct{}, h.MaxConcurrentGenerate)
}

// WaitBackground blocks until every background render has finished. Tests MUST
// call it before returning: a live render writes into the t.TempDir() being
// cleaned up.
func (h *Handler) WaitBackground() { h.background.Wait() }

// ServeHTTP routes /healthz, /og-cache/ and /og-warm/, then sends the rest to
// the generate path or the proxy according to Classify.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/healthz":
		h.handleHealthz(w, r)
		return
	case strings.HasPrefix(r.URL.Path, OGCachePathPrefix):
		h.serveCacheFile(w, r)
		return
	case strings.HasPrefix(r.URL.Path, WarmPathPrefix):
		h.handleWarm(w, r)
		return
	}
	dec := Classify(r.Header.Get("User-Agent"), r.URL.Path)
	if dec != DecisionGenerate {
		h.Proxy.ServeHTTP(w, r)
		return
	}
	h.handleGenerate(w, r)
}

func (h *Handler) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("{}"))
}

// handleGenerate answers a crawler from the resolved DID alone; a cache miss
// renders in the background rather than blocking the HTML. Only handle
// resolution can fail the request (404 unresolvable, 502 indigo failure).
//
// [TestHandler_CacheMiss_RespondsWithoutAwaitingTheRender] and
// [TestHandler_CacheMiss_BackgroundRenderWarmsTheNextRequest] pin both halves.
func (h *Handler) handleGenerate(w http.ResponseWriter, r *http.Request) {
	handle := ProfileHandle(r.URL.Path)
	if handle == "" {
		http.NotFound(w, r)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.genTimeout())
	defer cancel()

	resolved, err := h.Generator.Resolve(ctx, handle)
	if err != nil {
		status := AsHTTPStatus(err)
		log.Printf("opengraph-service: resolve %s failed: %v (status %d)", handle, err, status)
		http.Error(w, "og generation failed", status)
		return
	}
	if !resolved.Cached {
		h.spawnRender(handle, resolved.DID)
	}
	h.writeOGResponse(w, handle, resolved.DID)
}

func (h *Handler) writeOGResponse(w http.ResponseWriter, handle, did string) {
	htmlResp := BuildOGResponse(ResponseInput{
		ProfileHandle: handle,
		// Display name is unavailable here; the title uses the handle.
		DisplayName: strings.TrimPrefix(handle, "@"),
		ImageURL:    OGCachePathPrefix + SafeDID(did) + ".png",
		Origin:      h.Origin,
	})
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = w.Write([]byte(htmlResp))
}

// handleWarm warms the cache for a profile. It answers 202 whether or not a
// render started, since the caller must never surface a failure to the user.
//
// The route is unauthenticated, bounded by sharing spawnRender's render cap.
// Resolution happens before a slot is taken: otherwise warms for fresh or
// unresolvable handles would hold the cap and starve real crawls.
//
// [TestHandler_WarmOnColdProfile_TriggersExactlyOneRender] and
// [TestHandler_WarmOnFreshProfile_TriggersNoRender] pin the no-op-when-warm
// rule; [TestHandler_WarmIsBoundedByTheRenderCap] pins the bound; and
// [TestHandler_WarmOnFreshProfile_HoldsNoRenderSlot] pins that a warm with
// nothing to do leaves the cap alone.
func (h *Handler) handleWarm(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	handle := WarmHandle(r.URL.Path)
	if handle == "" {
		http.NotFound(w, r)
		return
	}
	started := h.warmProfile(r.Context(), handle)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusAccepted)
	if started {
		_, _ = w.Write([]byte(`{"warming":true}`))
		return
	}
	_, _ = w.Write([]byte(`{"warming":false}`))
}

// warmProfile spawns a render only for an uncached profile, reporting whether
// one started. A resolve failure is a no-op; the crawl will surface it.
func (h *Handler) warmProfile(reqCtx context.Context, handle string) bool {
	ctx, cancel := context.WithTimeout(reqCtx, h.genTimeout())
	defer cancel()

	resolved, err := h.Generator.Resolve(ctx, handle)
	if err != nil {
		log.Printf("opengraph-service: warm resolve %s failed: %v", handle, err)
		return false
	}
	if resolved.Cached {
		return false
	}
	return h.spawnRender(handle, resolved.DID)
}

// spawnRender renders did in a background goroutine under the render cap,
// reporting whether it started. Both entry points are unauthenticated and
// singleflight only dedups per DID, so rotating handles could otherwise drive
// unbounded renders. Work without a slot is dropped, not queued.
//
// The render is registered as pending before the goroutine starts so the
// image fetch that follows can always wait on it.
//
// [TestHandler_RenderCap_RunsBackgroundRenderWhenASlotIsFree] and
// [TestHandler_RenderCap_DropsBackgroundRenderWhenSaturated] pin both sides of
// the bound; [TestHandler_DroppedRender_DoesNotParkTheImageFetch] pins that a
// render the cap shed leaves nothing behind to wait on.
func (h *Handler) spawnRender(handle, did string) bool {
	if err := h.backgroundContext().Err(); err != nil {
		return false
	}
	if !h.acquireRenderSlot() {
		log.Printf("opengraph-service: background render for %s dropped: %d concurrent renders in flight",
			handle, cap(h.genSem))
		return false
	}
	donePending := h.pending.begin(SafeDID(did))
	h.background.Add(1)
	go func() {
		defer h.background.Done()
		defer h.releaseRenderSlot()
		defer donePending()
		ctx, cancel := context.WithTimeout(h.backgroundContext(), h.genTimeout())
		defer cancel()
		if err := h.Generator.EnsureRendered(ctx, did); err != nil {
			log.Printf("opengraph-service: background render for %s failed: %v", handle, err)
		}
	}()
	return true
}

func (h *Handler) backgroundContext() context.Context {
	if h.BackgroundCtx != nil {
		return h.BackgroundCtx
	}
	return context.Background()
}

func (h *Handler) genTimeout() time.Duration {
	if h.GenTimeout > 0 {
		return h.GenTimeout
	}
	return DefaultGenTimeout
}

func (h *Handler) pendingRenderWait() time.Duration {
	if h.PendingRenderWait == 0 {
		return DefaultPendingRenderWait
	}
	return h.PendingRenderWait
}

func (h *Handler) acquireRenderSlot() bool {
	if h.genSem == nil {
		return true
	}
	select {
	case h.genSem <- struct{}{}:
		return true
	default:
		return false
	}
}

func (h *Handler) releaseRenderSlot() {
	if h.genSem == nil {
		return
	}
	<-h.genSem
}

// serveCacheFile streams the stored PNG for /og-cache/:did.png. A miss waits
// briefly for an in-flight render, then serves the fallback rather than a 404;
// a malformed path still 404s.
//
// [TestHandler_OgCacheMiss_ServesFallbackAsNoStore],
// [TestHandler_OgCacheHit_ServesRenderWithLongMaxAge] and
// [TestHandler_OgCacheMalformedName_Returns404NotFallback] pin all three.
func (h *Handler) serveCacheFile(w http.ResponseWriter, r *http.Request) {
	name := h.cacheFileName(r.URL.Path)
	if name == "" {
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(h.Cache.Dir(), name)
	entry, err := h.Cache.LoadByPath(path)
	if err != nil && h.awaitPendingRender(r.Context(), pendingKey(name)) {
		entry, err = h.Cache.LoadByPath(path)
	}
	if err != nil {
		writeImage(w, "image/png", FallbackOGImage(), fallbackImageCacheControl)
		return
	}
	writeImage(w, entry.MimeType, entry.Bytes, renderedImageCacheControl)
}

// awaitPendingRender parks on the render in flight for key, reporting whether
// it finished within the wait. Cardyb fetches the image once, so this is the
// only chance to give it the profile card. It never starts a render, and a key
// nobody is rendering returns immediately.
//
// [TestHandler_OgCacheMiss_WaitsForTheInFlightRenderAndServesIt] pins the win,
// [TestHandler_OgCacheMiss_RenderOutlastsTheWait_ServesFallback] pins the cap,
// [TestHandler_OgCacheMiss_NothingInFlight_ServesFallbackImmediately] pins that
// nothing else waits, [TestHandler_OgCacheMiss_ClientDisconnects_StopsWaiting]
// pins the hangup, and
// [TestHandler_NegativePendingRenderWait_ServesFallbackImmediately] pins the
// off switch.
func (h *Handler) awaitPendingRender(ctx context.Context, key string) bool {
	wait := h.pendingRenderWait()
	if wait <= 0 {
		return false
	}
	done := h.pending.watch(key)
	if done == nil {
		return false
	}
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-done:
		return true
	case <-timer.C:
		return false
	case <-ctx.Done():
		return false
	}
}

// cacheFileName returns the filename an /og-cache/ request maps to, or "" if
// sanitizing would change it (a traversal or non-image request).
func (h *Handler) cacheFileName(path string) string {
	base := strings.TrimPrefix(path, OGCachePathPrefix)
	if base == "" || strings.ContainsAny(base, `/\`) {
		return ""
	}
	if safe := h.Cache.SafePathFromBase(base); safe == base {
		return safe
	}
	return ""
}

// pendingKey maps a validated filename back to its SafeDID pending key.
func pendingKey(name string) string { return strings.TrimSuffix(name, ".png") }

func writeImage(w http.ResponseWriter, mimeType string, body []byte, cacheControl string) {
	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Cache-Control", cacheControl)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}
