package shim

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// newHandlerOn registers h.WaitBackground as a cleanup so a background render cannot write into
// the t.TempDir() cache while it is being removed; cleanups run LIFO, so this runs first.
func newHandlerOn(t *testing.T, cache *FileCache, fetcher ProfileFetcher, renderer ImageRenderer) *Handler {
	t.Helper()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, `<!DOCTYPE html><html><head>
<meta property="og:image" content="https://navyfragen.app/og.png">
</head><body>SPA</body></html>`)
	}))
	t.Cleanup(upstream.Close)

	h, err := NewHandler(upstream.URL, NewGenerator(cache, fetcher, renderer), cache, "https://navyfragen.app")
	if err != nil {
		t.Fatalf("NewHandler: %v", err)
	}
	t.Cleanup(h.WaitBackground)
	return h
}

func newIntegrationHandler(t *testing.T, fetcher ProfileFetcher, renderer ImageRenderer) *Handler {
	t.Helper()
	return newHandlerOn(t, newTempCache(t), fetcher, renderer)
}

func newTempCache(t *testing.T) *FileCache {
	t.Helper()
	cache, err := NewFileCache(t.TempDir(), 100, time.Hour)
	if err != nil {
		t.Fatalf("NewFileCache: %v", err)
	}
	return cache
}

func defaultStubs() (*FakeFetcher, *FakeRenderer) {
	return &FakeFetcher{
		DID: "did:plc:integration",
		Profile: Profile{
			DisplayName: "Integration User",
			Handle:      "integration.test",
			Banner:      "https://cdn.bsky.app/b.jpg",
			Avatar:      "https://cdn.bsky.app/a.jpg",
		},
	}, &FakeRenderer{PNG: []byte("\x89PNG\r\n\x1a\nFAKE-PNG-BYTES")}
}

func do(t *testing.T, h *Handler, ua, path string) *httptest.ResponseRecorder {
	t.Helper()
	return doMethod(t, h, http.MethodGet, ua, path)
}

func doMethod(t *testing.T, h *Handler, method, ua, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	if ua != "" {
		req.Header.Set("User-Agent", ua)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestHandler_CardybOnProfile_GeneratesOGResponse(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)

	rec := do(t, h, "Bluesky Cardyb/1.2", "/profile/integration.test")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, `property="og:image"`) {
		t.Fatalf("response missing og:image tag\n--- body ---\n%s", body)
	}
	const wantImage = "https://navyfragen.app/og-cache/did-plc-integration.png"
	if !strings.Contains(body, wantImage) {
		t.Fatalf("og:image not absolute cache URL\ngot: %s\nwant substring: %s", body, wantImage)
	}
	if strings.Contains(body, "og.png") {
		t.Fatalf("response leaked the generic upstream og:image\n--- body ---\n%s", body)
	}
	if strings.Contains(body, "SPA") {
		t.Fatalf("generated response contains upstream body\n--- body ---\n%s", body)
	}
	h.WaitBackground()
	if c := atomic.LoadInt32(&fetcher.ResolveCalls); c != 1 {
		t.Fatalf("ResolveDID called %d times, want 1", c)
	}
	if c := atomic.LoadInt32(&fetcher.ProfileCalls); c != 1 {
		t.Fatalf("FetchProfile called %d times, want 1", c)
	}
	if c := atomic.LoadInt32(&renderer.Calls); c != 1 {
		t.Fatalf("renderer called %d times, want 1", c)
	}
}

func TestHandler_CacheMiss_RespondsWithoutAwaitingTheRender(t *testing.T) {
	fetcher, renderer := defaultStubs()
	started, release := make(chan struct{}, 4), make(chan struct{})
	blocked := &blockingRenderer{FakeRenderer: renderer, startedCh: started, releaseCh: release}
	h := newIntegrationHandler(t, fetcher, blocked)
	defer func() {
		close(release)
		h.WaitBackground()
	}()

	rec := do(t, h, CardybUA, "/profile/integration.test")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 while the render is still in flight", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "/og-cache/did-plc-integration.png") {
		t.Fatalf("miss response must still point at the DID's cache URL:\n%s", rec.Body.String())
	}
	<-started
	if c := atomic.LoadInt32(&renderer.Calls); c != 0 {
		t.Fatalf("renderer completed %d times, want 0 — the response awaited the render", c)
	}
}

func TestHandler_CacheMiss_BackgroundRenderWarmsTheNextRequest(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)

	if rec := do(t, h, CardybUA, "/profile/integration.test"); rec.Code != http.StatusOK {
		t.Fatalf("first crawl: status %d", rec.Code)
	}
	h.WaitBackground()

	imgRec := do(t, h, "Mozilla/5.0", "/og-cache/did-plc-integration.png")
	if imgRec.Code != http.StatusOK {
		t.Fatalf("cache serve: status %d, want 200", imgRec.Code)
	}
	if got := imgRec.Body.String(); got != string(renderer.PNG) {
		t.Fatalf("cache serve returned %q, want the background render's bytes %q", got, renderer.PNG)
	}
	if cc := imgRec.Header().Get("Cache-Control"); cc != renderedImageCacheControl {
		t.Fatalf("Cache-Control = %q, want %q (a real render, not the fallback)", cc, renderedImageCacheControl)
	}
	if rec := do(t, h, CardybUA, "/profile/integration.test"); rec.Code != http.StatusOK {
		t.Fatalf("second crawl: status %d", rec.Code)
	}
	h.WaitBackground()
	if c := atomic.LoadInt32(&renderer.Calls); c != 1 {
		t.Fatalf("renderer called %d times, want 1 (the warmed cache must skip the render)", c)
	}
}

func TestHandler_BrowserOnProfile_ProxiesToUpstream(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)

	rec := do(t, h, "Mozilla/5.0 (Windows NT 10.0)", "/profile/integration.test")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "SPA") {
		t.Fatalf("browser UA should proxy upstream; got\n--- body ---\n%s", body)
	}
	if !strings.Contains(body, "og.png") {
		t.Fatalf("proxied response missing upstream og:image\n--- body ---\n%s", body)
	}
	if c := atomic.LoadInt32(&fetcher.ResolveCalls); c != 0 {
		t.Fatalf("ResolveDID called %d times, want 0 (pass-through)", c)
	}
	if c := atomic.LoadInt32(&renderer.Calls); c != 0 {
		t.Fatalf("renderer called %d times, want 0 (pass-through)", c)
	}
}

func TestHandler_CardybOnRoot_ProxiesToUpstream(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)

	for _, p := range []string{"/", "/messages", "/inbox"} {
		rec := do(t, h, "Bluesky Cardyb", p)
		if rec.Code != http.StatusOK {
			t.Fatalf("path %q: status = %d, want 200", p, rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "SPA") {
			t.Fatalf("path %q: Cardyb should proxy (not a profile route); got\n%s", p, rec.Body.String())
		}
	}
	if c := atomic.LoadInt32(&fetcher.ResolveCalls); c != 0 {
		t.Fatalf("ResolveDID called %d times, want 0 (non-profile paths)", c)
	}
}

// The shim must not special-case /api/*; Caddy owns that split.
func TestHandler_ApiPath_ProxiesNotGenerates(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)

	rec := do(t, h, "Bluesky Cardyb", "/api/profile/foo")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "SPA") {
		t.Fatalf("/api/* should proxy even under Cardyb; got\n%s", rec.Body.String())
	}
	if c := atomic.LoadInt32(&fetcher.ResolveCalls); c != 0 {
		t.Fatalf("ResolveDID called %d times, want 0 (/api/*)", c)
	}
}

func TestHandler_RepeatWithinTTL_CacheHitSkipsFetchAndRender(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)

	rec1 := do(t, h, "Bluesky Cardyb", "/profile/integration.test")
	if rec1.Code != http.StatusOK {
		t.Fatalf("first: status %d", rec1.Code)
	}
	h.WaitBackground()
	rec2 := do(t, h, "Bluesky Cardyb", "/profile/integration.test")
	if rec2.Code != http.StatusOK {
		t.Fatalf("second: status %d", rec2.Code)
	}
	h.WaitBackground()
	if rec1.Body.String() != rec2.Body.String() {
		t.Fatalf("second response differs from first\ngot:  %s\nwant: %s",
			rec2.Body.String(), rec1.Body.String())
	}
	if c := atomic.LoadInt32(&fetcher.ResolveCalls); c != 2 {
		t.Fatalf("ResolveDID called %d times, want 2 (once per request)", c)
	}
	if c := atomic.LoadInt32(&fetcher.ProfileCalls); c != 1 {
		t.Fatalf("FetchProfile called %d times, want 1 (second was a cache hit)", c)
	}
	if c := atomic.LoadInt32(&renderer.Calls); c != 1 {
		t.Fatalf("renderer called %d times, want 1 (second was a cache hit)", c)
	}
}

func TestHandler_ExpiredEntry_Regenerates(t *testing.T) {
	cache := newTempCache(t)
	fetcher, renderer := defaultStubs()
	h := newHandlerOn(t, cache, fetcher, renderer)

	rec1 := do(t, h, "Bluesky Cardyb", "/profile/integration.test")
	if rec1.Code != http.StatusOK {
		t.Fatalf("first: status %d", rec1.Code)
	}
	h.WaitBackground()
	if c := atomic.LoadInt32(&renderer.Calls); c != 1 {
		t.Fatalf("after first: renderer called %d, want 1", c)
	}

	pngPath := cache.pngPath("did:plc:integration")
	past := time.Now().Add(-2 * time.Hour)
	if err := chtimes(pngPath, past, past); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	rec2 := do(t, h, "Bluesky Cardyb", "/profile/integration.test")
	if rec2.Code != http.StatusOK {
		t.Fatalf("second: status %d", rec2.Code)
	}
	h.WaitBackground()
	if c := atomic.LoadInt32(&renderer.Calls); c != 2 {
		t.Fatalf("after second: renderer called %d, want 2 (regeneration)", c)
	}
	if c := atomic.LoadInt32(&fetcher.ProfileCalls); c != 2 {
		t.Fatalf("after second: FetchProfile called %d, want 2 (regeneration)", c)
	}
}

func TestHandler_GeneratedImageURL_ServesCachedPNG(t *testing.T) {
	fetcher, renderer := defaultStubs()
	png := []byte("\x89PNG\r\n\x1a\nFAKE-PNG-BYTES")
	renderer.PNG = png
	h := newIntegrationHandler(t, fetcher, renderer)

	rec := do(t, h, "Bluesky Cardyb", "/profile/integration.test")
	if rec.Code != http.StatusOK {
		t.Fatalf("generate: status %d", rec.Code)
	}
	h.WaitBackground()

	imgRec := do(t, h, "Mozilla/5.0", "/og-cache/did-plc-integration.png")
	if imgRec.Code != http.StatusOK {
		t.Fatalf("cache serve: status %d, want 200", imgRec.Code)
	}
	got := imgRec.Body.String()
	if !strings.HasPrefix(got, "\x89PNG") {
		t.Fatalf("served bytes are not a PNG: %q", got)
	}
	if got != string(png) {
		t.Fatalf("served PNG mismatch\ngot:  %q\nwant: %q", got, png)
	}
	if ct := imgRec.Header().Get("Content-Type"); ct != "image/png" {
		t.Fatalf("Content-Type = %q, want image/png", ct)
	}
}

func TestHandler_UnresolvableHandle_Returns404AndDoesNotPanic(t *testing.T) {
	fetcher, renderer := defaultStubs()
	fetcher.ResolveErr = ErrProfileNotFound
	h := newIntegrationHandler(t, fetcher, renderer)

	rec := do(t, h, "Bluesky Cardyb", "/profile/nobody.bsky.social")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 for unresolvable handle", rec.Code)
	}
	h.WaitBackground()
	if c := atomic.LoadInt32(&fetcher.ProfileCalls); c != 0 {
		t.Fatalf("FetchProfile called %d, want 0", c)
	}
	if c := atomic.LoadInt32(&renderer.Calls); c != 0 {
		t.Fatalf("renderer called %d, want 0", c)
	}
}

func TestHandler_RenderFailure_StillAnswersTheCrawler(t *testing.T) {
	fetcher, renderer := defaultStubs()
	renderer.Err = errRenderBoom
	h := newIntegrationHandler(t, fetcher, renderer)

	rec := do(t, h, "Bluesky Cardyb", "/profile/integration.test")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 — a failed render must not reach the crawler", rec.Code)
	}
	h.WaitBackground()

	imgRec := do(t, h, "Mozilla/5.0", "/og-cache/did-plc-integration.png")
	if imgRec.Code != http.StatusOK {
		t.Fatalf("cache serve: status %d, want 200 (the fallback)", imgRec.Code)
	}
	if !bytes.Equal(imgRec.Body.Bytes(), FallbackOGImage()) {
		t.Fatal("a failed render must leave the branded fallback in place")
	}
}

var errRenderBoom = newSentinelErr("render boom")

func newSentinelErr(msg string) error {
	return &sentinelErr{msg: msg}
}

type sentinelErr struct{ msg string }

func (e *sentinelErr) Error() string { return e.msg }

func TestHandler_OgCacheMiss_ServesFallbackAsNoStore(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)

	rec := do(t, h, "Mozilla/5.0", "/og-cache/did-plc-never-rendered.png")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (fallback, not 404)", rec.Code)
	}
	if !bytes.Equal(rec.Body.Bytes(), FallbackOGImage()) {
		t.Fatalf("body is not the embedded fallback (%d bytes served, %d embedded)",
			rec.Body.Len(), len(FallbackOGImage()))
	}
	if !bytes.HasPrefix(rec.Body.Bytes(), []byte("\x89PNG")) {
		t.Fatal("the fallback must be a real PNG — a crawler discards anything else")
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/png" {
		t.Fatalf("Content-Type = %q, want image/png", ct)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store — the fallback must never be cached as the profile's card", cc)
	}
}

// The 40ms release is one-directional: a scheduler slow enough to let the render
// finish first makes this test prove less, never fail.
func TestHandler_OgCacheMiss_WaitsForTheInFlightRenderAndServesIt(t *testing.T) {
	fetcher, renderer := defaultStubs()
	started, release := make(chan struct{}, 4), make(chan struct{})
	blocked := &blockingRenderer{FakeRenderer: renderer, startedCh: started, releaseCh: release}
	h := newIntegrationHandler(t, fetcher, blocked)
	h.PendingRenderWait = 5 * time.Second

	if rec := do(t, h, CardybUA, "/profile/integration.test"); rec.Code != http.StatusOK {
		t.Fatalf("crawl: status %d", rec.Code)
	}
	<-started
	if c := atomic.LoadInt32(&renderer.Calls); c != 0 {
		t.Fatalf("renderer completed %d times before the image fetch — nothing was left to wait on", c)
	}
	go func() {
		time.Sleep(40 * time.Millisecond)
		close(release)
	}()

	imgRec := do(t, h, "Mozilla/5.0", "/og-cache/did-plc-integration.png")

	if imgRec.Code != http.StatusOK {
		t.Fatalf("cache serve: status %d, want 200", imgRec.Code)
	}
	if got := imgRec.Body.String(); got != string(renderer.PNG) {
		t.Fatalf("served %q, want the render this fetch waited for %q", got, renderer.PNG)
	}
	if cc := imgRec.Header().Get("Cache-Control"); cc != renderedImageCacheControl {
		t.Fatalf("Cache-Control = %q, want %q (a real render, not the fallback)", cc, renderedImageCacheControl)
	}
}

func TestHandler_OgCacheMiss_RenderOutlastsTheWait_ServesFallback(t *testing.T) {
	fetcher, renderer := defaultStubs()
	started, release := make(chan struct{}, 4), make(chan struct{})
	blocked := &blockingRenderer{FakeRenderer: renderer, startedCh: started, releaseCh: release}
	h := newIntegrationHandler(t, fetcher, blocked)
	h.PendingRenderWait = 20 * time.Millisecond
	defer close(release)

	if rec := do(t, h, CardybUA, "/profile/integration.test"); rec.Code != http.StatusOK {
		t.Fatalf("crawl: status %d", rec.Code)
	}
	<-started

	imgRec := do(t, h, "Mozilla/5.0", "/og-cache/did-plc-integration.png")

	if imgRec.Code != http.StatusOK {
		t.Fatalf("cache serve: status %d, want 200 (the fallback)", imgRec.Code)
	}
	if !bytes.Equal(imgRec.Body.Bytes(), FallbackOGImage()) {
		t.Fatal("a render that outlasts the wait must fall back, not hold the crawler")
	}
}

// The route is unauthenticated and takes arbitrary DIDs: waiting on an unrendered one would let anyone hold connections.
func TestHandler_OgCacheMiss_NothingInFlight_ServesFallbackImmediately(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)
	// Long enough that taking the wait is unmistakable rather than a slow machine.
	h.PendingRenderWait = time.Minute

	start := time.Now()
	rec := do(t, h, "Mozilla/5.0", "/og-cache/did-plc-nobody-is-rendering.png")
	elapsed := time.Since(start)

	if !bytes.Equal(rec.Body.Bytes(), FallbackOGImage()) {
		t.Fatal("a DID with no render in flight must get the fallback")
	}
	if elapsed > 5*time.Second {
		t.Fatalf("waited %s on a render that does not exist", elapsed)
	}
}

func TestHandler_OgCacheMiss_ClientDisconnects_StopsWaiting(t *testing.T) {
	fetcher, renderer := defaultStubs()
	started, release := make(chan struct{}, 4), make(chan struct{})
	blocked := &blockingRenderer{FakeRenderer: renderer, startedCh: started, releaseCh: release}
	h := newIntegrationHandler(t, fetcher, blocked)
	h.PendingRenderWait = time.Minute
	defer close(release)

	if rec := do(t, h, CardybUA, "/profile/integration.test"); rec.Code != http.StatusOK {
		t.Fatalf("crawl: status %d", rec.Code)
	}
	<-started

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	req := httptest.NewRequest(http.MethodGet, "/og-cache/did-plc-integration.png", nil).WithContext(ctx)
	rec := httptest.NewRecorder()
	start := time.Now()
	h.ServeHTTP(rec, req)
	elapsed := time.Since(start)
	cancel()

	if elapsed > 5*time.Second {
		t.Fatalf("kept waiting %s after the client went away", elapsed)
	}
	if !bytes.Equal(rec.Body.Bytes(), FallbackOGImage()) {
		t.Fatal("an abandoned wait must still resolve to the fallback, not hang or 404")
	}
}

// Escape hatch: Cardyb's timeout is unpublished, so a negative PendingRenderWait must answer every miss immediately.
func TestHandler_NegativePendingRenderWait_ServesFallbackImmediately(t *testing.T) {
	fetcher, renderer := defaultStubs()
	started, release := make(chan struct{}, 4), make(chan struct{})
	blocked := &blockingRenderer{FakeRenderer: renderer, startedCh: started, releaseCh: release}
	h := newIntegrationHandler(t, fetcher, blocked)
	h.PendingRenderWait = -1
	defer close(release)

	if rec := do(t, h, CardybUA, "/profile/integration.test"); rec.Code != http.StatusOK {
		t.Fatalf("crawl: status %d", rec.Code)
	}
	<-started

	rec := do(t, h, "Mozilla/5.0", "/og-cache/did-plc-integration.png")

	if !bytes.Equal(rec.Body.Bytes(), FallbackOGImage()) {
		t.Fatal("a disabled wait must serve the fallback rather than park on the render")
	}
}

func TestHandler_DroppedRender_DoesNotParkTheImageFetch(t *testing.T) {
	fetcher, renderer := defaultStubs()
	started, release := make(chan struct{}, 8), make(chan struct{})
	blocked := &blockingRenderer{FakeRenderer: renderer, startedCh: started, releaseCh: release}
	h := newHandlerOn(t, newTempCache(t), &handleDIDFetcher{FakeFetcher: fetcher}, blocked)
	h.MaxConcurrentGenerate = 1
	h.initSem()
	h.PendingRenderWait = time.Minute
	defer close(release)

	if rec := do(t, h, CardybUA, "/profile/leader.test"); rec.Code != http.StatusOK {
		t.Fatalf("leader: status %d", rec.Code)
	}
	<-started
	if rec := do(t, h, CardybUA, "/profile/follower.test"); rec.Code != http.StatusOK {
		t.Fatalf("follower: status %d", rec.Code)
	}

	start := time.Now()
	rec := do(t, h, "Mozilla/5.0", "/og-cache/did-plc-follower-test.png")
	elapsed := time.Since(start)

	if !bytes.Equal(rec.Body.Bytes(), FallbackOGImage()) {
		t.Fatal("a shed render must leave the fallback in place")
	}
	if elapsed > 5*time.Second {
		t.Fatalf("waited %s on a render the cap dropped", elapsed)
	}
}

func TestHandler_WarmThenCrawl_ImageFetchWaitsOnTheWarmsRender(t *testing.T) {
	fetcher, renderer := defaultStubs()
	started, release := make(chan struct{}, 4), make(chan struct{})
	blocked := &blockingRenderer{FakeRenderer: renderer, startedCh: started, releaseCh: release}
	h := newIntegrationHandler(t, fetcher, blocked)
	h.PendingRenderWait = 5 * time.Second

	if rec := doMethod(t, h, http.MethodPost, "", "/og-warm/integration.test"); rec.Code != http.StatusAccepted {
		t.Fatalf("warm: status %d", rec.Code)
	}
	<-started
	go func() {
		time.Sleep(40 * time.Millisecond)
		close(release)
	}()

	if rec := do(t, h, CardybUA, "/profile/integration.test"); rec.Code != http.StatusOK {
		t.Fatalf("crawl: status %d", rec.Code)
	}
	imgRec := do(t, h, "Mozilla/5.0", "/og-cache/did-plc-integration.png")

	if got := imgRec.Body.String(); got != string(renderer.PNG) {
		t.Fatalf("served %q, want the warm's render %q", got, renderer.PNG)
	}
	h.WaitBackground()
	if c := atomic.LoadInt32(&renderer.Calls); c != 1 {
		t.Fatalf("renderer called %d times, want 1 (the crawl must join the warm's render)", c)
	}
}

func TestHandler_OgCacheHit_ServesRenderWithLongMaxAge(t *testing.T) {
	cache := newTempCache(t)
	fetcher, renderer := defaultStubs()
	h := newHandlerOn(t, cache, fetcher, renderer)
	if err := cache.Store("did:plc:integration", []byte("\x89PNGREAL"), "image/png"); err != nil {
		t.Fatalf("Store: %v", err)
	}

	rec := do(t, h, "Mozilla/5.0", "/og-cache/did-plc-integration.png")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if rec.Body.String() != "\x89PNGREAL" {
		t.Fatalf("body = %q, want the stored render", rec.Body.String())
	}
	if cc := rec.Header().Get("Cache-Control"); cc != renderedImageCacheControl {
		t.Fatalf("Cache-Control = %q, want %q", cc, renderedImageCacheControl)
	}
}

func TestHandler_OgCacheTraversal_Returns404(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)

	for _, p := range []string{
		"/og-cache/../../etc/passwd",
		"/og-cache/..%2f..%2fetc%2fpasswd.png",
		"/og-cache/%2e%2e%2f.png",
	} {
		rec := do(t, h, "", p)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("path %q: status = %d, want 404 (traversal must be neutralized)", p, rec.Code)
		}
	}
}

func TestHandler_OgCacheMalformedName_Returns404NotFallback(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)

	for _, p := range []string{
		"/og-cache/",              // no name at all
		"/og-cache/did-plc-a.jpg", // not a PNG
		"/og-cache/did-plc-a",     // no extension
		"/og-cache/did..plc.png",  // a stem SafeDID would rewrite
		"/og-cache//did-plc-a.png",
		`/og-cache/sub\dir.png`,
	} {
		rec := do(t, h, "", p)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("path %q: status = %d, want 404 (malformed is not a pending render)", p, rec.Code)
		}
		if bytes.Equal(rec.Body.Bytes(), FallbackOGImage()) {
			t.Fatalf("path %q: served the fallback for a malformed request", p)
		}
	}
}

func TestHandler_Healthz(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)

	rec := do(t, h, "", "/healthz")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
	if rec.Body.String() != "{}" {
		t.Fatalf("healthz body = %q, want {}", rec.Body.String())
	}
}

func TestHandler_WarmOnColdProfile_TriggersExactlyOneRender(t *testing.T) {
	cache := newTempCache(t)
	fetcher, renderer := defaultStubs()
	h := newHandlerOn(t, cache, fetcher, renderer)

	rec := doMethod(t, h, http.MethodPost, "", "/og-warm/integration.test")

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
	if body := rec.Body.String(); body != `{"warming":true}` {
		t.Fatalf("body = %q, want {\"warming\":true}", body)
	}
	h.WaitBackground()
	if c := atomic.LoadInt32(&renderer.Calls); c != 1 {
		t.Fatalf("renderer called %d times, want exactly 1", c)
	}
	if _, err := cache.Load("did:plc:integration"); err != nil {
		t.Fatalf("the warm must have populated the cache: %v", err)
	}
}

func TestHandler_WarmOnFreshProfile_TriggersNoRender(t *testing.T) {
	cache := newTempCache(t)
	fetcher, renderer := defaultStubs()
	h := newHandlerOn(t, cache, fetcher, renderer)
	if err := cache.Store("did:plc:integration", []byte("\x89PNGREAL"), "image/png"); err != nil {
		t.Fatalf("Store: %v", err)
	}

	rec := doMethod(t, h, http.MethodPost, "", "/og-warm/integration.test")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", rec.Code)
	}
	h.WaitBackground()

	if c := atomic.LoadInt32(&fetcher.ProfileCalls); c != 0 {
		t.Fatalf("FetchProfile called %d times, want 0 on an already-fresh profile", c)
	}
	if c := atomic.LoadInt32(&renderer.Calls); c != 0 {
		t.Fatalf("renderer called %d times, want 0 on an already-fresh profile", c)
	}
	entry, err := cache.Load("did:plc:integration")
	if err != nil || string(entry.Bytes) != "\x89PNGREAL" {
		t.Fatalf("the warm must have left the existing render untouched (%v)", err)
	}
}

// spawnRender drops rather than queues, so a warm must resolve before taking a slot or fresh/unresolvable warms starve crawls.
func TestHandler_WarmOnFreshProfile_HoldsNoRenderSlot(t *testing.T) {
	cache := newTempCache(t)
	fetcher, renderer := defaultStubs()
	h := newHandlerOn(t, cache, fetcher, renderer)
	h.MaxConcurrentGenerate = 1
	h.initSem()
	if err := cache.Store("did:plc:integration", []byte("\x89PNGREAL"), "image/png"); err != nil {
		t.Fatalf("Store: %v", err)
	}

	rec := doMethod(t, h, http.MethodPost, "", "/og-warm/integration.test")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", rec.Code)
	}
	if body := rec.Body.String(); body != `{"warming":false}` {
		t.Fatalf("body = %q, want {\"warming\":false} — a fresh profile takes no render slot", body)
	}
	h.WaitBackground()
}

func TestHandler_WarmWithNonPostMethod_Returns405(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)

	for _, method := range []string{http.MethodGet, http.MethodPut, http.MethodDelete, http.MethodPatch} {
		rec := doMethod(t, h, method, "", "/og-warm/integration.test")
		if rec.Code != http.StatusMethodNotAllowed {
			t.Fatalf("%s /og-warm: status = %d, want 405", method, rec.Code)
		}
		if allow := rec.Header().Get("Allow"); allow != http.MethodPost {
			t.Fatalf("%s /og-warm: Allow = %q, want POST", method, allow)
		}
	}
	h.WaitBackground()
	if c := atomic.LoadInt32(&renderer.Calls); c != 0 {
		t.Fatalf("renderer called %d times, want 0 — a rejected method must not warm", c)
	}
}

func TestHandler_WarmWithEmptyHandle_Returns404(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)

	for _, p := range []string{"/og-warm/", "/og-warm/a/b"} {
		rec := doMethod(t, h, http.MethodPost, "", p)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("POST %s: status = %d, want 404", p, rec.Code)
		}
	}
	h.WaitBackground()
	if c := atomic.LoadInt32(&fetcher.ResolveCalls); c != 0 {
		t.Fatalf("ResolveDID called %d times, want 0 — an empty handle must not reach the AppView", c)
	}
}

func TestHandler_WarmFailure_StillAccepts(t *testing.T) {
	fetcher, renderer := defaultStubs()
	fetcher.ResolveErr = ErrProfileNotFound
	h := newIntegrationHandler(t, fetcher, renderer)

	rec := doMethod(t, h, http.MethodPost, "", "/og-warm/nobody.bsky.social")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202 even when the warm cannot succeed", rec.Code)
	}
	if body := rec.Body.String(); body != `{"warming":false}` {
		t.Fatalf("body = %q, want {\"warming\":false} when the handle does not resolve", body)
	}
	h.WaitBackground()
	if c := atomic.LoadInt32(&renderer.Calls); c != 0 {
		t.Fatalf("renderer called %d times, want 0", c)
	}
}

func TestHandler_WarmIsBoundedByTheRenderCap(t *testing.T) {
	fetcher, renderer := defaultStubs()
	started, release := make(chan struct{}, 8), make(chan struct{})
	blocked := &blockingRenderer{FakeRenderer: renderer, startedCh: started, releaseCh: release}
	h := newHandlerOn(t, newTempCache(t), &handleDIDFetcher{FakeFetcher: fetcher}, blocked)
	h.MaxConcurrentGenerate = 1
	h.initSem()

	if rec := doMethod(t, h, http.MethodPost, "", "/og-warm/first.test"); rec.Code != http.StatusAccepted {
		t.Fatalf("first warm: status %d", rec.Code)
	}
	<-started
	defer func() {
		close(release)
		h.WaitBackground()
	}()

	rec := doMethod(t, h, http.MethodPost, "", "/og-warm/second.test")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("a shed warm must still be accepted, got %d", rec.Code)
	}
	if body := rec.Body.String(); body != `{"warming":false}` {
		t.Fatalf("body = %q, want {\"warming\":false} when the cap sheds the warm", body)
	}
}

func TestHandler_RenderCap_RunsBackgroundRenderWhenASlotIsFree(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newHandlerOn(t, newTempCache(t), &handleDIDFetcher{FakeFetcher: fetcher}, renderer)
	h.MaxConcurrentGenerate = 1
	h.initSem()

	if rec := do(t, h, CardybUA, "/profile/first.test"); rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	h.WaitBackground()
	if c := atomic.LoadInt32(&renderer.Calls); c != 1 {
		t.Fatalf("renderer called %d times, want 1 (a free slot must run the render)", c)
	}
}

// Singleflight dedups per DID only; rotating handles (spoofed Cardyb) would otherwise drive unbounded renders.
func TestHandler_RenderCap_DropsBackgroundRenderWhenSaturated(t *testing.T) {
	fetcher, renderer := defaultStubs()
	started, release := make(chan struct{}, 8), make(chan struct{})
	blocked := &blockingRenderer{FakeRenderer: renderer, startedCh: started, releaseCh: release}
	h := newHandlerOn(t, newTempCache(t), &handleDIDFetcher{FakeFetcher: fetcher}, blocked)
	h.MaxConcurrentGenerate = 1
	h.initSem()

	if rec := do(t, h, CardybUA, "/profile/leader.test"); rec.Code != http.StatusOK {
		t.Fatalf("leader: status %d", rec.Code)
	}
	<-started
	defer func() {
		close(release)
		h.WaitBackground()
	}()

	rec := do(t, h, CardybUA, "/profile/follower.test")
	if rec.Code != http.StatusOK {
		t.Fatalf("a shed render must not fail the crawler, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "/og-cache/did-plc-follower-test.png") {
		t.Fatalf("the follower must still be pointed at its own cache URL:\n%s", rec.Body.String())
	}
	select {
	case <-started:
		t.Fatal("a second render started while the cap was saturated")
	case <-time.After(50 * time.Millisecond):
	}
}

func TestHandler_RenderCap_ProxyUnaffected(t *testing.T) {
	fetcher, renderer := defaultStubs()
	started, release := make(chan struct{}, 8), make(chan struct{})
	blocked := &blockingRenderer{FakeRenderer: renderer, startedCh: started, releaseCh: release}
	h := newHandlerOn(t, newTempCache(t), &handleDIDFetcher{FakeFetcher: fetcher}, blocked)
	h.MaxConcurrentGenerate = 1
	h.initSem()

	if rec := do(t, h, CardybUA, "/profile/busy.test"); rec.Code != http.StatusOK {
		t.Fatalf("saturating request: status %d", rec.Code)
	}
	<-started
	defer func() {
		close(release)
		h.WaitBackground()
	}()

	rec := do(t, h, "Mozilla/5.0", "/some/path")
	if rec.Code != http.StatusOK {
		t.Fatalf("proxy fast path must not be gated by the render cap, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "SPA") {
		t.Fatalf("proxy fast path did not reach upstream: %q", rec.Body.String())
	}
}

func TestHandler_CancelledBackgroundContext_DropsNewRenders(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)
	ctx, cancel := context.WithCancel(context.Background())
	h.BackgroundCtx = ctx
	cancel()

	rec := do(t, h, CardybUA, "/profile/integration.test")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 — shutdown must not fail the crawler", rec.Code)
	}
	h.WaitBackground()
	if c := atomic.LoadInt32(&renderer.Calls); c != 0 {
		t.Fatalf("renderer called %d times, want 0 after the background context was cancelled", c)
	}
}

// blockingRenderer blocks Render until releaseCh closes, signaling startedCh on entry; Calls only advances on completion.
type blockingRenderer struct {
	*FakeRenderer
	startedCh chan<- struct{}
	releaseCh <-chan struct{}
}

func (b *blockingRenderer) Render(ctx context.Context, html string) ([]byte, error) {
	select {
	case b.startedCh <- struct{}{}:
	default:
	}
	select {
	case <-b.releaseCh:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	return b.FakeRenderer.Render(ctx, html)
}

// handleDIDFetcher gives every handle its own DID, or singleflight would coalesce and mask a broken cap.
type handleDIDFetcher struct{ *FakeFetcher }

func (f *handleDIDFetcher) ResolveDID(ctx context.Context, handle string) (string, error) {
	if _, err := f.FakeFetcher.ResolveDID(ctx, handle); err != nil {
		return "", err
	}
	return "did:plc:" + strings.ReplaceAll(handle, ".", "-"), nil
}

func TestNewHandler_BareHostnameDefaultsToHTTP(t *testing.T) {
	fetcher, renderer := defaultStubs()
	cache := newTempCache(t)
	gen := NewGenerator(cache, fetcher, renderer)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "ok")
	}))
	t.Cleanup(upstream.Close)

	bare := strings.TrimPrefix(upstream.URL, "http://")
	h, err := NewHandler(bare, gen, cache, "https://navyfragen.app")
	if err != nil {
		t.Fatalf("NewHandler with bare hostname: %v", err)
	}
	t.Cleanup(h.WaitBackground)

	rec := do(t, h, "Mozilla/5.0", "/")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (bare hostname should default to http and proxy)", rec.Code)
	}
	if rec.Body.String() != "ok" {
		t.Fatalf("body = %q, want %q (upstream not reached)", rec.Body.String(), "ok")
	}
}

func chtimes(path string, atime, mtime time.Time) error {
	return os.Chtimes(path, atime, mtime)
}

func TestNewHandler_InvalidUpstreamURL_ReturnsError(t *testing.T) {
	fetcher, renderer := defaultStubs()
	cache := newTempCache(t)
	gen := NewGenerator(cache, fetcher, renderer)

	// Already contains "://" so NewHandler's bare-hostname default does not
	// apply; the unbalanced bracket makes url.Parse itself fail.
	_, err := NewHandler("http://[::1", gen, cache, "https://navyfragen.app")
	if err == nil {
		t.Fatal("expected an error for a malformed upstream URL")
	}
}

func TestHandler_InitSem_NegativeDisablesCap(t *testing.T) {
	h := &Handler{MaxConcurrentGenerate: -1}
	h.initSem()
	if h.genSem != nil {
		t.Fatal("a negative MaxConcurrentGenerate should disable the semaphore (nil genSem)")
	}
	if !h.acquireRenderSlot() {
		t.Fatal("a disabled cap must never refuse a render slot")
	}
	h.releaseRenderSlot()
}

func TestHandler_InitSem_ZeroFallsBackToDefault(t *testing.T) {
	h := &Handler{MaxConcurrentGenerate: 0}
	h.initSem()
	if h.MaxConcurrentGenerate != DefaultMaxConcurrentGenerate {
		t.Fatalf("MaxConcurrentGenerate = %d, want default %d", h.MaxConcurrentGenerate, DefaultMaxConcurrentGenerate)
	}
	if cap(h.genSem) != DefaultMaxConcurrentGenerate {
		t.Fatalf("genSem capacity = %d, want %d", cap(h.genSem), DefaultMaxConcurrentGenerate)
	}
}

func TestHandler_HandleGenerate_EmptyHandleIsNotFound(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)

	// A path that ServeHTTP's Classify would never route to handleGenerate
	// (isProfilePath would be false), called directly to exercise the guard.
	req := httptest.NewRequest(http.MethodGet, "/profile/", nil)
	rec := httptest.NewRecorder()
	h.handleGenerate(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 for an empty handle", rec.Code)
	}
	if atomic.LoadInt32(&fetcher.ResolveCalls) != 0 {
		t.Fatal("the fetcher must not be reached when the handle is empty")
	}
}

func TestHandler_HandleGenerate_ZeroTimeoutFallsBackToDefault(t *testing.T) {
	fetcher, renderer := defaultStubs()
	h := newIntegrationHandler(t, fetcher, renderer)
	h.GenTimeout = 0 // bypass NewHandler's default to hit the fallback directly

	rec := do(t, h, CardybUA, "/profile/integration.test")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (a zero GenTimeout should fall back to the default, not fail)", rec.Code)
	}
	if h.genTimeout() != DefaultGenTimeout {
		t.Fatalf("genTimeout() = %s, want %s", h.genTimeout(), DefaultGenTimeout)
	}
}
