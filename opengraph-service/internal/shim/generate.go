package shim

import (
	"context"
	"errors"
	"log"

	"golang.org/x/sync/singleflight"
)

// ResolvedProfile is what the OG HTML response needs: the DID keying the image
// URL and whether a fresh render already backs it.
type ResolvedProfile struct {
	DID    string
	Cached bool
}

// Generator runs the OG image pipeline: a cheap Resolve and an expensive
// EnsureRendered that callers run in the background.
type Generator struct {
	Cache    *FileCache
	Fetcher  ProfileFetcher
	Renderer ImageRenderer
	group    singleflight.Group
}

// NewGenerator wires a Generator.
func NewGenerator(cache *FileCache, fetcher ProfileFetcher, renderer ImageRenderer) *Generator {
	return &Generator{Cache: cache, Fetcher: fetcher, Renderer: renderer}
}

// Resolve maps a handle to its DID and cache state without rendering. Failures
// are typed (ErrProfileNotFound).
func (g *Generator) Resolve(ctx context.Context, handle string) (ResolvedProfile, error) {
	did, err := g.Fetcher.ResolveDID(ctx, handle)
	if err != nil {
		return ResolvedProfile{}, err
	}
	return ResolvedProfile{DID: did, Cached: g.Cache.Fresh(did)}, nil
}

// EnsureRendered renders and stores the image for did unless a fresh entry
// exists; concurrent callers coalesce via singleflight.
//
// [TestEnsureRendered_Singleflight_CoalescesConcurrentCalls] pins the dedup and
// [TestEnsureRendered_FreshEntry_SkipsFetchAndRender] pins the no-op-when-warm
// half that makes a repeat warm free.
func (g *Generator) EnsureRendered(ctx context.Context, did string) error {
	// singleflight runs under the leader's context; detach it so a leader that
	// hangs up does not abort the render for its followers.
	workCtx, workCancel := detachContext(ctx)
	defer workCancel()
	_, err, _ := g.group.Do(did, func() (any, error) {
		return nil, g.renderIfStale(workCtx, did)
	})
	return err
}

// detachContext keeps ctx's deadline but not its cancellation. The returned
// cancel MUST be called to release the timer.
func detachContext(ctx context.Context) (context.Context, context.CancelFunc) {
	if ctx == nil {
		return context.Background(), func() {}
	}
	if dl, ok := ctx.Deadline(); ok {
		return context.WithDeadline(context.Background(), dl)
	}
	bg, cancel := context.WithCancel(context.Background())
	return context.WithValue(bg, ctxKey{}, ctx), cancel
}

// ctxKey keys the original ctx on the detached one.
type ctxKey struct{}

// renderIfStale is the singleflight body; its freshness re-check makes a
// follower's turn free once the leader has stored.
func (g *Generator) renderIfStale(ctx context.Context, did string) error {
	if g.Cache.Fresh(did) {
		return nil
	}

	prof, err := g.Fetcher.FetchProfile(ctx, did)
	if err != nil {
		return err
	}

	pngBytes, err := g.Renderer.Render(ctx, BuildOGTemplate(prof.ToOGInput()))
	if err != nil {
		return err
	}

	if err := g.Cache.Store(did, pngBytes, "image/png"); err != nil {
		// Non-fatal: the next request retries; meanwhile the fallback is served.
		log.Printf("opengraph-service: cache store for %s failed: %v", did, err)
	}
	return nil
}

// AsHTTPStatus maps an orchestrator error to an HTTP status; unknown errors
// are 502.
func AsHTTPStatus(err error) int {
	switch {
	case err == nil:
		return 200
	case errors.Is(err, ErrProfileNotFound):
		return 404
	case errors.Is(err, ErrRenderFailed):
		return 502
	default:
		return 502
	}
}
