// Command shim is the opengraph-service reverse proxy. Everything except
// Bluesky Cardyb on /profile/:handle is proxied to the client; Cardyb gets a
// per-profile OG image, cached by DID and served from /og-cache/:did.png.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/karanshukla/navyfragen-app/opengraph-service/internal/shim"
)

func main() {
	var (
		frontendURL = flag.String("frontend", envOr("FRONTEND_URL", "http://client:3000"), "upstream client URL to proxy to")
		exportURL   = flag.String("export-html-url", envOr("EXPORT_HTML_URL", "http://html-to-image:3033/"), "html-to-image service URL")
		appViewHost = flag.String("appview-host", envOr("ATPROTO_APPVIEW_HOST", shim.DefaultAppViewHost), "AT Protocol AppView host")
		nfServerURL = flag.String("nf-server-url", envOr("NF_SERVER_URL", shim.DefaultNFServerHost), "NF server base URL, for reading the owner's customPrompt/touchpointLocale")
		settingsTO  = flag.String("settings-timeout", envOr("OG_SETTINGS_TIMEOUT", "6s"), "NF settings-read deadline (Go duration)")
		cacheDir    = flag.String("cache-dir", envOr("OG_CACHE_DIR", "/data/og-cache"), "cache directory (Railway volume)")
		cacheTTL    = flag.String("cache-ttl", envOr("OG_CACHE_TTL", "720h"), "cache TTL (Go duration; ~1 month)")
		cacheMaxStr = flag.String("cache-max-entries", envOr("OG_CACHE_MAX_ENTRIES", "0"), "max cache entries; 0 = built-in default")
		renderTO    = flag.String("render-timeout", envOr("OG_RENDER_TIMEOUT", "30s"), "html-to-image render deadline")
		pendingWait = flag.String("pending-render-wait", envOr("OG_PENDING_RENDER_WAIT", ""), "how long /og-cache/ waits on an in-flight render; empty = built-in default")
		origin      = flag.String("origin", envOr("PUBLIC_URL", "https://kodamachi.app"), "public site origin for absolute OG URLs")
		addr        = flag.String("addr", normalizeAddr(envOr("PORT", "8080")), "listen address")
	)
	flag.Parse()

	ttl := shim.ParseTTL(*cacheTTL, 720*time.Hour)
	maxEntries := parseIntOr(*cacheMaxStr, shim.DefaultCacheMaxEntries)
	cache, err := shim.NewFileCache(*cacheDir, maxEntries, ttl)
	if err != nil {
		log.Fatalf("open cache %s: %v", *cacheDir, err)
	}

	fetcher := shim.NewIndigoFetcher(*appViewHost)
	fetcher.Settings = shim.NewNFSettingsClient(*nfServerURL, parseDurationOr(*settingsTO, 6*time.Second))
	renderer := shim.NewHTMLToImageRenderer(*exportURL, parseDurationOr(*renderTO, 30*time.Second))
	generator := shim.NewGenerator(cache, fetcher, renderer)

	handler, err := shim.NewHandler(*frontendURL, generator, cache, *origin)
	if err != nil {
		log.Fatalf("build handler: %v", err)
	}
	// Renders outlive the request that scheduled them. Cancelling this stops
	// renders not yet started; running ones are joined at shutdown.
	backgroundCtx, stopBackground := context.WithCancel(context.Background())
	defer stopBackground()
	handler.BackgroundCtx = backgroundCtx
	// Tunable because Cardyb's own timeout is unpublished.
	handler.PendingRenderWait = parseDurationOr(*pendingWait, shim.DefaultPendingRenderWait)

	log.Printf("opengraph-service shim listening on %s, proxying to %s (cache %s, ttl %s)",
		*addr, *frontendURL, *cacheDir, ttl)

	srv := &http.Server{
		Addr:              *addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		// No WriteTimeout: the generate path can take seconds.
		IdleTimeout: 120 * time.Second,
	}

	// Drain connections, then join background renders.
	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		ctx, cancel := context.WithTimeout(context.Background(), shutdownGrace)
		defer cancel()
		_ = srv.Shutdown(ctx)
		stopBackground()
		drain(handler.WaitBackground, shutdownGrace)
	}()

	if err := srv.ListenAndServe(); !shim.IsErrServerClosed(err) {
		log.Fatalf("listen: %v", err)
	}
	<-shutdownDone
}

// shutdownGrace bounds both halves of shutdown: draining connections, then
// joining background renders.
const shutdownGrace = 10 * time.Second

// drain runs wait with a ceiling. A background render's own deadline can exceed
// the platform's SIGTERM-to-SIGKILL window, and an unbounded join would then
// turn a graceful shutdown into a killed one; the cache write it was racing is
// atomic either way.
func drain(wait func(), grace time.Duration) {
	done := make(chan struct{})
	go func() {
		defer close(done)
		wait()
	}()
	select {
	case <-done:
	case <-time.After(grace):
		log.Printf("opengraph-service: background renders still running after %s, exiting anyway", grace)
	}
}

func envOr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// normalizeAddr turns a bare port ("8080") into the listen form (":8080") that
// net/http expects, while leaving already-qualified addresses ("0.0.0.0:8080",
// "[::]:8080") untouched. Railway and docker compose commonly pass PORT as a
// bare number.
func normalizeAddr(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ":8080"
	}
	if strings.ContainsAny(s, ":[]") {
		return s
	}
	return ":" + s
}

func parseDurationOr(s string, def time.Duration) time.Duration {
	s = strings.TrimSpace(s)
	if s == "" {
		return def
	}
	d, err := time.ParseDuration(s)
	if err != nil || d <= 0 {
		return def
	}
	return d
}

func parseIntOr(s string, def int) int {
	s = strings.TrimSpace(s)
	if s == "" || s == "0" {
		return def
	}
	var n int
	for _, c := range s {
		if c < '0' || c > '9' {
			return def
		}
		n = n*10 + int(c-'0')
	}
	if n <= 0 {
		return def
	}
	return n
}
