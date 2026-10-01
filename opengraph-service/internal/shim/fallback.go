package shim

import _ "embed"

// fallbackOGImageBytes is embedded because the distroless runtime has no
// filesystem to read it from.
//
//go:embed assets/og.png
var fallbackOGImageBytes []byte

// FallbackOGImage returns the branded OG card served while a DID's real render
// has not landed.
func FallbackOGImage() []byte { return fallbackOGImageBytes }
