// Package bench holds in-process benchmarks of the shim fast path's reverse-proxy overhead.
package bench

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"strings"
	"testing"
)

const stubPayload = `<!DOCTYPE html><html><head><title>stub</title></head><body>ok</body></html>`

func BenchmarkDirectHandler(b *testing.B) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, stubPayload)
	}))
	defer upstream.Close()

	client := upstream.Client()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp, err := client.Get(upstream.URL)
		if err != nil {
			b.Fatal(err)
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
}

func BenchmarkViaReverseProxy(b *testing.B) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, stubPayload)
	}))
	defer upstream.Close()

	target, _ := url.Parse(upstream.URL)
	proxy := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = target.Scheme
			req.URL.Host = target.Host
			req.Host = target.Host
		},
	}
	shim := httptest.NewServer(proxy)
	defer shim.Close()

	client := shim.Client()
	resp, err := client.Get(shim.URL)
	if err != nil {
		b.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(body), "ok") {
		b.Fatalf("shim did not proxy: got %q", body)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp, err := client.Get(shim.URL)
		if err != nil {
			b.Fatal(err)
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
}
