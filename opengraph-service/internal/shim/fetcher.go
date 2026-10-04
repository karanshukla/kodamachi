package shim

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	neturl "net/url"
	"strings"
	"time"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/xrpc"
)

// Profile is the actor profile and NF settings needed to render an OG image.
type Profile struct {
	DID         string
	Handle      string
	DisplayName string
	Banner      string
	Avatar      string
	Prompt      string // customPrompt; empty means resolvePrompt's default
	Locale      string // touchpointLocale; empty means English
}

// NormalizedHandle returns the handle without a leading "@".
func (p Profile) NormalizedHandle() string {
	return strings.TrimPrefix(p.Handle, "@")
}

// ToOGInput converts the profile to the template's input.
func (p Profile) ToOGInput() OGInput {
	return OGInput{
		DisplayName: p.DisplayName,
		Handle:      p.NormalizedHandle(),
		Banner:      p.Banner,
		Avatar:      p.Avatar,
		Prompt:      p.Prompt,
		Locale:      p.Locale,
	}
}

// ProfileFetcher is split in two so the cache lookup can sit between the cheap
// handle resolve and the full profile read.
type ProfileFetcher interface {
	// ResolveDID maps a handle to its DID, the cache key.
	ResolveDID(ctx context.Context, handle string) (string, error)
	// FetchProfile reads the full profile by DID.
	FetchProfile(ctx context.Context, did string) (Profile, error)
}

// IndigoFetcher resolves handles and fetches profiles via indigo.
type IndigoFetcher struct {
	Client *xrpc.Client
	// Settings reads the owner's prompt and locale; nil leaves them unset.
	Settings *NFSettingsClient
}

// NewIndigoFetcher returns a fetcher for host, without a Settings client.
func NewIndigoFetcher(host string) *IndigoFetcher {
	if host == "" {
		host = DefaultAppViewHost
	}
	return &IndigoFetcher{Client: &xrpc.Client{Host: host}}
}

// DefaultAppViewHost must match server/src/services/profile-service.ts.
const DefaultAppViewHost = "https://api.bsky.app"

// ResolveDID maps a handle to its DID; unresolvable handles are ErrProfileNotFound.
func (f *IndigoFetcher) ResolveDID(ctx context.Context, handle string) (string, error) {
	handle = strings.TrimPrefix(handle, "@")
	resolved, err := atproto.IdentityResolveHandle(ctx, f.Client, handle)
	if err != nil {
		if isNotFound(err) {
			return "", ErrProfileNotFound
		}
		return "", err
	}
	return resolved.Did, nil
}

// FetchProfile reads the profile by DID, plus settings when attached. A
// settings failure never fails the call and leaves Prompt/Locale unset:
// [TestIndigoFetcher_FetchProfile_SettingsFailure_StillReturnsProfile] and
// [TestIndigoFetcher_FetchProfile_SettingsTimeout_StillReturnsProfile].
func (f *IndigoFetcher) FetchProfile(ctx context.Context, did string) (Profile, error) {
	prof, err := bsky.ActorGetProfile(ctx, f.Client, did)
	if err != nil {
		if isNotFound(err) {
			return Profile{}, ErrProfileNotFound
		}
		return Profile{}, err
	}
	p := Profile{
		DID:         did,
		Handle:      prof.Handle,
		DisplayName: derefStr(prof.DisplayName),
		Banner:      derefStr(prof.Banner),
		Avatar:      derefStr(prof.Avatar),
	}
	if f.Settings != nil {
		if settings, err := f.Settings.FetchSettings(ctx, did); err == nil {
			p.Prompt = settings.CustomPrompt
			p.Locale = settings.TouchpointLocale
		}
	}
	return p, nil
}

// ErrProfileNotFound signals that a handle or profile did not resolve.
var ErrProfileNotFound = errors.New("profile not found")

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// isNotFound reports whether err is an xrpc not-found: the AppView answers an
// unknown handle or profile with 400 as well as 404.
func isNotFound(err error) bool {
	if err == nil {
		return false
	}
	var xe *xrpc.Error
	if errors.As(err, &xe) {
		return xe.StatusCode == 400 || xe.StatusCode == 404
	}
	// Errors wrapped by a transport layer still carry indigo's text.
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "not found") || strings.Contains(msg, "unable to resolve handle")
}

// DefaultNFServerHost is the docker-compose address of the NF server. Railway
// has no "server" DNS name, so deployed environments MUST set NF_SERVER_URL
// (see opengraph-service/RAILWAY.md); unset, the card falls back to English.
const DefaultNFServerHost = "http://server:3000"

// NFSettings is the part of an owner's settings the OG card needs.
type NFSettings struct {
	CustomPrompt     string
	TouchpointLocale string
}

// nfPublicProfileResponse is the shape of the NF server's
// GET /public-profile/:did (server/src/hono/message-routes.ts).
type nfPublicProfileResponse struct {
	CustomPrompt     *string `json:"customPrompt"`
	TouchpointLocale *string `json:"touchpointLocale"`
}

// settingsWakeRetryableStatuses is deliberately separate from
// wakeRetryableStatuses so the policies can diverge;
// [TestSettingsWakeRetryableStatuses_MatchRenderer] fails when only one moves.
var settingsWakeRetryableStatuses = map[int]bool{
	http.StatusRequestTimeout:     true,
	http.StatusBadGateway:         true,
	http.StatusServiceUnavailable: true,
	http.StatusGatewayTimeout:     true,
}

// Shorter than the renderer's: this is a JSON GET, and a generous budget only
// delays the fallback.
const (
	defaultSettingsTimeout        = 6 * time.Second
	defaultSettingsAttemptTimeout = 3 * time.Second
	maxSettingsBackoff            = 1 * time.Second
)

// NFSettingsClient reads NFSettings from the NF server, with the retry policy
// of HTMLToImageRenderer.
type NFSettingsClient struct {
	Host   string
	Client *http.Client
	// Timeout bounds the full retry loop; AttemptTimeout bounds one attempt.
	Timeout        time.Duration
	AttemptTimeout time.Duration
}

// NewNFSettingsClient returns a client for host; timeout <= 0 uses
// defaultSettingsTimeout.
func NewNFSettingsClient(host string, timeout time.Duration) *NFSettingsClient {
	if host == "" {
		host = DefaultNFServerHost
	}
	if timeout <= 0 {
		timeout = defaultSettingsTimeout
	}
	attempt := defaultSettingsAttemptTimeout
	if timeout < attempt {
		attempt = timeout
	}
	return &NFSettingsClient{
		Host: strings.TrimSuffix(host, "/"),
		// No Client.Timeout: it would bound the whole loop.
		Client:         &http.Client{},
		Timeout:        timeout,
		AttemptTimeout: attempt,
	}
}

// FetchSettings reads did's public settings. Network errors and wake statuses
// retry with capped backoff until the deadline; other failures return at once.
func (s *NFSettingsClient) FetchSettings(ctx context.Context, did string) (NFSettings, error) {
	// Escaped so a crafted did cannot retarget the GET at another NF endpoint.
	// [TestNFSettingsClient_EscapesDIDInPath] pins it.
	endpoint := fmt.Sprintf("%s/public-profile/%s", s.Host, neturl.PathEscape(did))

	deadline := time.Now().Add(s.Timeout)
	delay := 250 * time.Millisecond
	var lastErr error

	for {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return NFSettings{}, fmt.Errorf("nf-settings: %w", ctxErr)
		}
		remaining := time.Until(deadline)
		if remaining <= 0 {
			break
		}

		respBytes, status, err := s.attempt(ctx, endpoint, minDuration(s.attemptTimeout(), remaining))
		switch {
		case err != nil:
			// An unresolvable name is a permanent misconfiguration and retries
			// only add latency; other transport errors mean the service is booting.
			// [TestNFSettingsClient_DNSResolutionFailure_IsNotRetried] pins this.
			var dnsErr *net.DNSError
			if errors.As(err, &dnsErr) && dnsErr.IsNotFound {
				return NFSettings{}, fmt.Errorf("nf-settings: %w", err)
			}
			lastErr = err
		case settingsWakeRetryableStatuses[status]:
			lastErr = fmt.Errorf("nf-settings %d: %s", status, strings.TrimSpace(string(respBytes)))
		case status/100 != 2:
			return NFSettings{}, fmt.Errorf("nf-settings %d: %s", status, strings.TrimSpace(string(respBytes)))
		default:
			var body nfPublicProfileResponse
			if err := json.Unmarshal(respBytes, &body); err != nil {
				return NFSettings{}, fmt.Errorf("nf-settings: decode: %w", err)
			}
			return NFSettings{
				CustomPrompt:     derefStr(body.CustomPrompt),
				TouchpointLocale: derefStr(body.TouchpointLocale),
			}, nil
		}

		wait := minDuration(delay, time.Until(deadline))
		if wait <= 0 {
			break
		}
		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return NFSettings{}, fmt.Errorf("nf-settings: %w", ctx.Err())
		case <-timer.C:
		}
		delay = minDuration(delay*2, maxSettingsBackoff)
	}
	return NFSettings{}, fmt.Errorf("nf-settings: after retries: %v", lastErr)
}

// attempt performs one GET under its own deadline. A transport error returns
// status 0.
func (s *NFSettingsClient) attempt(ctx context.Context, endpoint string, timeout time.Duration) ([]byte, int, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, bytes.NewReader(nil))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := s.Client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, err
	}
	return respBytes, resp.StatusCode, nil
}

func (s *NFSettingsClient) attemptTimeout() time.Duration {
	if s.AttemptTimeout > 0 {
		return s.AttemptTimeout
	}
	return defaultSettingsAttemptTimeout
}
