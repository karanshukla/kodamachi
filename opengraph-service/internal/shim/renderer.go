package shim

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ErrRenderFailed wraps any failure from the html-to-image service.
var ErrRenderFailed = errors.New("render failed")

// ImageRenderer renders an HTML source document to image bytes.
type ImageRenderer interface {
	Render(ctx context.Context, htmlSrc string) ([]byte, error)
}

// A waking html-to-image answers with HTTP errors rather than network ones:
// Railway's edge returns 502, the service 503 while Chromium launches. Mirrors
// WAKE_RETRYABLE_STATUSES in server/src/lib/image-generator.ts; 4xx and 429 are
// deliberately absent.
var wakeRetryableStatuses = map[int]bool{
	http.StatusRequestTimeout:     true,
	http.StatusBadGateway:         true,
	http.StatusServiceUnavailable: true,
	http.StatusGatewayTimeout:     true,
}

// maxRenderBackoff caps the retry delay.
const maxRenderBackoff = 2 * time.Second

// defaultAttemptTimeout bounds one attempt; a cold one pays a container wake
// plus a Chromium launch, and anything longer is a hang worth retrying.
const defaultAttemptTimeout = 15 * time.Second

// HTMLToImageRenderer POSTs the composite HTML to the html-to-image service.
type HTMLToImageRenderer struct {
	URL     string
	Client  *http.Client
	Timeout time.Duration // overall deadline including retries
	// AttemptTimeout bounds a single attempt, so one hung connection cannot
	// consume the whole Timeout.
	AttemptTimeout time.Duration
}

// NewHTMLToImageRenderer returns a renderer whose retry loop is bounded by
// timeout (30s if <= 0).
func NewHTMLToImageRenderer(url string, timeout time.Duration) *HTMLToImageRenderer {
	if url == "" {
		url = "http://localhost:3033/"
	}
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	attempt := defaultAttemptTimeout
	if timeout < attempt {
		attempt = timeout
	}
	return &HTMLToImageRenderer{
		URL: url,
		// No Client.Timeout: it would bound the whole loop, not one attempt.
		Client:         &http.Client{},
		Timeout:        timeout,
		AttemptTimeout: attempt,
	}
}

// renderRequest is the body html-to-image expects.
type renderRequest struct {
	Source  string         `json:"source"`
	Format  string         `json:"format"`
	Options map[string]any `json:"options"`
}

// Render POSTs the HTML and returns the image bytes. Network errors and wake
// statuses retry with capped backoff until the deadline; other non-2xx
// responses are final. Failures wrap ErrRenderFailed.
func (r *HTMLToImageRenderer) Render(ctx context.Context, htmlSrc string) ([]byte, error) {
	body, err := json.Marshal(renderRequest{
		Source: htmlSrc,
		Format: "png",
		Options: map[string]any{
			"width":  OGWidth,
			"height": OGHeight,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("%w: marshal: %v", ErrRenderFailed, err)
	}

	deadline := time.Now().Add(r.Timeout)
	delay := 500 * time.Millisecond
	var lastErr error

	for {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return nil, fmt.Errorf("%w: %v", ErrRenderFailed, ctxErr)
		}
		remaining := time.Until(deadline)
		if remaining <= 0 {
			break
		}

		respBytes, status, err := r.attempt(ctx, body, minDuration(r.attemptTimeout(), remaining))
		switch {
		case err != nil:
			lastErr = err
		case wakeRetryableStatuses[status]:
			lastErr = fmt.Errorf("html-to-image %d: %s", status, strings.TrimSpace(string(respBytes)))
		case status/100 != 2:
			return nil, fmt.Errorf("%w: html-to-image %d: %s",
				ErrRenderFailed, status, strings.TrimSpace(string(respBytes)))
		case len(respBytes) == 0:
			return nil, fmt.Errorf("%w: empty response", ErrRenderFailed)
		default:
			return respBytes, nil
		}

		wait := minDuration(delay, time.Until(deadline))
		if wait <= 0 {
			break
		}
		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, fmt.Errorf("%w: %v", ErrRenderFailed, ctx.Err())
		case <-timer.C:
		}
		delay = minDuration(delay*2, maxRenderBackoff)
	}
	return nil, fmt.Errorf("%w: after retries: %v", ErrRenderFailed, lastErr)
}

// attempt performs one POST under its own deadline. A transport error returns
// status 0.
func (r *HTMLToImageRenderer) attempt(ctx context.Context, body []byte, timeout time.Duration) ([]byte, int, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.URL, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.Client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		// A truncated read mid-wake is transient, so it stays retryable.
		return nil, 0, err
	}
	return respBytes, resp.StatusCode, nil
}

func (r *HTMLToImageRenderer) attemptTimeout() time.Duration {
	if r.AttemptTimeout > 0 {
		return r.AttemptTimeout
	}
	return defaultAttemptTimeout
}

func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
