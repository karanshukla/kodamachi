package shim

import (
	"testing"
	"time"
)

func TestPendingRenders_SecondBeginKeepsWaitersParkedUntilBothRelease(t *testing.T) {
	var p pendingRenders

	releaseWarm := p.begin("did-plc-x")
	releaseCrawl := p.begin("did-plc-x")
	done := p.watch("did-plc-x")
	if done == nil {
		t.Fatal("watch returned nil while two renders were in flight")
	}

	releaseWarm()
	select {
	case <-done:
		t.Fatal("waiters woken with a render still in flight")
	default:
	}

	releaseCrawl()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("waiters still parked after the last render released")
	}
	if p.watch("did-plc-x") != nil {
		t.Fatal("the key must be cleared once the last render finished, or later fetches wait on a closed render")
	}
}

func TestPendingRenders_WatchWithNothingInFlight_ReturnsNil(t *testing.T) {
	var p pendingRenders

	if p.watch("did-plc-never-begun") != nil {
		t.Fatal("watch on an unknown key must report nothing to wait for")
	}

	p.begin("did-plc-done")()
	if p.watch("did-plc-done") != nil {
		t.Fatal("watch on a finished render must report nothing to wait for")
	}
}

func TestPendingRenders_SeparateKeysDoNotShareAWait(t *testing.T) {
	var p pendingRenders

	releaseA := p.begin("did-plc-a")
	p.begin("did-plc-b")

	releaseA()
	if p.watch("did-plc-a") != nil {
		t.Fatal("a finished render must not stay watchable")
	}
	doneB := p.watch("did-plc-b")
	if doneB == nil {
		t.Fatal("b's render must survive a's finishing")
	}
	select {
	case <-doneB:
		t.Fatal("b's waiters were woken by a's render finishing")
	default:
	}
}
