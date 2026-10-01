package shim

import "strings"

// SafeDID turns a DID into a filename that cannot escape the cache directory.
// The DID comes from untrusted input, so colons, separators and traversal
// segments are neutralized.
func SafeDID(did string) string {
	if did == "" {
		return ""
	}
	did = strings.ReplaceAll(did, ":", "-")
	did = strings.ReplaceAll(did, "/", "-")
	did = strings.ReplaceAll(did, "\\", "-")
	// [TestSafeDID_StripsParentTraversal] pins that no crafted DID survives as a
	// parent-directory reference.
	did = strings.ReplaceAll(did, "..", "")
	return did
}
