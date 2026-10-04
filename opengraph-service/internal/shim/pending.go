package shim

import "sync"

// pendingRenders tracks in-flight renders an image fetch may wait on, keyed by
// SafeDID. Without it a fetch cannot tell "render a second away" from "nothing
// coming", and Cardyb bakes the fallback in permanently.
//
// Entries are reference counted: a warm and the crawl behind it both begin a
// render for one profile, and waiters stay parked until the last finishes.
//
// [TestPendingRenders_SecondBeginKeepsWaitersParkedUntilBothRelease] pins the
// refcount and [TestPendingRenders_WatchWithNothingInFlight_ReturnsNil] pins
// the nothing-to-wait-for answer that keeps a fallback serve immediate.
type pendingRenders struct {
	mu sync.Mutex
	m  map[string]*pendingRender
}

type pendingRender struct {
	done chan struct{}
	refs int
}

// begin registers an in-flight render for key. The caller MUST call the
// returned release exactly once, or later waiters park for their full wait.
func (p *pendingRenders) begin(key string) func() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.m == nil {
		p.m = make(map[string]*pendingRender)
	}
	entry, ok := p.m[key]
	if !ok {
		entry = &pendingRender{done: make(chan struct{})}
		p.m[key] = entry
	}
	entry.refs++
	return func() { p.release(key, entry) }
}

func (p *pendingRenders) release(key string, entry *pendingRender) {
	p.mu.Lock()
	entry.refs--
	last := entry.refs == 0
	if last {
		delete(p.m, key)
	}
	p.mu.Unlock()
	if last {
		close(entry.done)
	}
}

// watch returns a channel closed when the render for key finishes, or nil when
// none is in flight; callers must not park on nil.
func (p *pendingRenders) watch(key string) <-chan struct{} {
	p.mu.Lock()
	defer p.mu.Unlock()
	entry, ok := p.m[key]
	if !ok {
		return nil
	}
	return entry.done
}
