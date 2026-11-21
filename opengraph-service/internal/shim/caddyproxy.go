package shim

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sync"

	"github.com/caddyserver/caddy/v2"
	"github.com/caddyserver/caddy/v2/caddyconfig"
	_ "github.com/caddyserver/caddy/v2/caddyconfig/caddyfile"          // caddyfile adapter
	_ "github.com/caddyserver/caddy/v2/modules/caddyhttp/reverseproxy" // reverse_proxy directive
	_ "github.com/caddyserver/caddy/v2/modules/caddyhttp/standard"     // core HTTP directives
)

// caddyUpstreamHeader carries the per-request destination (host:port) into the
// embedded engine. Caddy's running config is a process-wide singleton, so one
// loopback engine is shared by every Handler (tests build many, with different
// upstreams) and each request is tagged with where it goes.
const caddyUpstreamHeader = "X-Navyfragen-Internal-Upstream"

var (
	caddyEngineOnce sync.Once
	caddyEngineAddr string
	caddyEngineErr  error
)

// ensureCaddyEngine lazily starts the embedded engine and returns its loopback
// address (127.0.0.1, OS-assigned port).
func ensureCaddyEngine() (string, error) {
	caddyEngineOnce.Do(func() {
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			caddyEngineErr = fmt.Errorf("pick embedded caddy port: %w", err)
			return
		}
		caddyEngineAddr = ln.Addr().String()
		_ = ln.Close()

		caddyfileText := fmt.Sprintf(`{
	admin off
	auto_https off
}
http://%s {
	reverse_proxy {http.request.header.%s} {
		flush_interval 100ms
	}
}
`, caddyEngineAddr, caddyUpstreamHeader)

		adapter := caddyconfig.GetAdapter("caddyfile")
		if adapter == nil {
			caddyEngineErr = errors.New("caddyfile adapter not registered")
			return
		}
		configJSON, _, err := adapter.Adapt([]byte(caddyfileText), nil)
		if err != nil {
			caddyEngineErr = fmt.Errorf("adapt embedded caddy config: %w", err)
			return
		}
		if err := caddy.Load(configJSON, true); err != nil {
			caddyEngineErr = fmt.Errorf("start embedded caddy engine: %w", err)
			return
		}
	})
	return caddyEngineAddr, caddyEngineErr
}

// newCaddyProxy returns a handler that forwards every request to target via
// the embedded engine.
func newCaddyProxy(target *url.URL) (http.Handler, error) {
	engineAddr, err := ensureCaddyEngine()
	if err != nil {
		return nil, err
	}
	engineURL := &url.URL{Scheme: "http", Host: engineAddr}
	proxy := httputil.NewSingleHostReverseProxy(engineURL)
	baseDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		baseDirector(req)
		// The default director leaves req.Host alone, and the engine's site
		// block is host-matched: without this Caddy silently no-ops.
		req.Host = engineURL.Host
		req.Header.Set(caddyUpstreamHeader, target.Host)
	}
	proxy.ErrorHandler = proxyErrorHandler
	return proxy, nil
}

// IsErrServerClosed reports whether err is http.ErrServerClosed, the expected
// result of a graceful shutdown.
func IsErrServerClosed(err error) bool {
	return errors.Is(err, http.ErrServerClosed)
}

// proxyErrorHandler handles a failed hop into the embedded engine (not a down
// frontend, which Caddy reports itself). Client disconnects are not logged.
func proxyErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, context.Canceled) {
		return
	}
	log.Printf("opengraph-service: embedded caddy proxy error for %s %s: %v",
		r.Method, r.URL.Path, err)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusBadGateway)
	_, _ = w.Write([]byte("upstream unavailable\n"))
}
