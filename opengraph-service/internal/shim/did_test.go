package shim

import "testing"

// A DID comes from an untrusted upstream, so the cache filename is untrusted input.

func TestSafeDID_PLC(t *testing.T) {
	if got := SafeDID("did:plc:abcdef123"); got != "did-plc-abcdef123" {
		t.Fatalf("got %q", got)
	}
}

func TestSafeDID_Web(t *testing.T) {
	if got := SafeDID("did:web:example.com"); got != "did-web-example.com" {
		t.Fatalf("got %q", got)
	}
}

func TestSafeDID_StripsParentTraversal(t *testing.T) {
	got := SafeDID("../../etc/passwd")
	if got == "../../etc/passwd" {
		t.Fatalf("traversal unchanged: %q", got)
	}
	for _, bad := range []string{"/", "\\", ".."} {
		if contains(got, bad) {
			t.Fatalf("SafeDID left %q in result %q", bad, got)
		}
	}
}

func TestSafeDID_Empty(t *testing.T) {
	if got := SafeDID(""); got != "" {
		t.Fatalf("empty input should map to empty, got %q", got)
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
