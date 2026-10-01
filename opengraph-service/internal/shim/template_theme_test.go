package shim

import (
	"fmt"
	"math"
	"strings"
	"testing"
)

// wcagAA is the AA minimum for body text; large text would allow 3.0, but the @handle row is small.
const wcagAA = 4.5

func TestOGPalette_EveryTextColourClearsAAOnEverySurface(t *testing.T) {
	for _, bg := range ogSurfaces {
		for _, fg := range ogTextColors {
			ratio := contrastRatio(t, fg, bg)
			if ratio < wcagAA {
				t.Errorf("%s on %s = %.2f:1, below WCAG AA (%.1f:1)", fg, bg, ratio, wcagAA)
			}
		}
	}
}

func TestContrastRatio_RejectsALowContrastPair(t *testing.T) {
	if got := contrastRatio(t, ogTextMuted, "#B9B2DD"); got >= wcagAA {
		t.Fatalf("muted text on a light lilac should fail AA, got %.2f:1", got)
	}
	// Known anchor: pure white on pure black is exactly 21:1.
	if got := contrastRatio(t, "#FFFFFF", "#000000"); math.Abs(got-21) > 0.01 {
		t.Fatalf("white on black = %.4f:1, want 21:1 — the luminance maths is wrong", got)
	}
}

func TestOGPalette_MutedHandleTextOnSurface(t *testing.T) {
	if got := contrastRatio(t, ogTextMuted, ogSurface); got < wcagAA {
		t.Fatalf("@handle (%s on %s) = %.2f:1, below AA", ogTextMuted, ogSurface, got)
	}
}

func TestOGPalette_ChipTextOnChipBackground(t *testing.T) {
	if got := contrastRatio(t, ogFillNavy, ogChipBG); got < wcagAA {
		t.Fatalf("chip label (%s on %s) = %.2f:1, below AA", ogFillNavy, ogChipBG, got)
	}
}

// A banner is an arbitrary user photo, so text over it has unbounded contrast the palette test cannot
// assert: the banner element must stay empty.
func TestOGTemplate_NoTextSitsOnTheBanner(t *testing.T) {
	html := BuildOGTemplate(OGInput{
		DisplayName: "Alice",
		Handle:      "alice.bsky.social",
		Banner:      "https://cdn.bsky.app/banner.jpg",
		Avatar:      "https://cdn.bsky.app/avatar.jpg",
		Prompt:      "Ask me anything",
	})
	banner := between(html, `<div class="banner">`, `</div>`)
	if strings.Contains(banner, "Alice") || strings.Contains(banner, "Ask me anything") {
		t.Fatalf("text inside the banner strip, where contrast cannot be guaranteed: %q", banner)
	}
	if got := strings.TrimSpace(banner); got != `<img src="https://cdn.bsky.app/banner.jpg" alt="">` {
		t.Fatalf("banner strip should hold only the image, got %q", got)
	}
}

// 'Noto Color Emoji' gives U+0020 a 1.25em advance; ahead of the text webfonts it blows word gaps out ~4.5x
// when they fail to load (document.fonts.ready resolves on failure too).
func TestOGFontStack_EmojiFamilyIsLast(t *testing.T) {
	families := splitFontStack(ogFontStack)
	last := families[len(families)-1]
	if !strings.Contains(last, "Noto Color Emoji") {
		t.Fatalf("emoji family must be last in the stack to keep it off the space glyph; last is %q\nstack: %s", last, ogFontStack)
	}
}

func TestOGFontStack_HasALocalTextFallbackBeforeTheGeneric(t *testing.T) {
	families := splitFontStack(ogFontStack)
	genericAt := -1
	for i, f := range families {
		if f == "sans-serif" {
			genericAt = i
		}
	}
	if genericAt < 0 {
		t.Fatalf("stack has no generic sans-serif: %s", ogFontStack)
	}
	// Families that ship with the html-to-image container (ttf-freefont) or with
	// any ordinary Linux image, i.e. present without a network fetch.
	local := []string{"Liberation Sans", "DejaVu Sans"}
	for _, want := range local {
		found := false
		for _, f := range families[:genericAt] {
			if strings.Contains(f, want) {
				found = true
			}
		}
		if !found {
			t.Errorf("no offline fallback %q ahead of the generic in the stack: %s", want, ogFontStack)
		}
	}
}

// system-ui in the Chromium container is whatever fontconfig holds, so the stack leads with Noto for a deterministic render.
func TestOGFontStack_LeadsWithNotoNotABrandWebfont(t *testing.T) {
	html := BuildOGTemplate(OGInput{Handle: "a.bsky.social"})
	if !strings.HasPrefix(ogFontStack, "'Noto Sans',") {
		t.Fatalf("Noto Sans must lead the stack, got %s", ogFontStack)
	}
	if !strings.Contains(html, "family=Noto+Sans") {
		t.Fatalf("template does not load Noto Sans, so the render is at the container's mercy")
	}
	for _, brand := range []string{"Inter", "JetBrains"} {
		if strings.Contains(html, brand) {
			t.Fatalf("template requests the %s webfont; the app no longer ships one", brand)
		}
	}
}

func TestOGGeometry_VerticalBandsFitTheCanvas(t *testing.T) {
	total := 0
	for _, b := range ogVerticalBands {
		total += b
	}
	if total > OGHeight {
		t.Fatalf("layout bands total %dpx, overflowing the %dpx canvas by %dpx: %v",
			total, OGHeight, total-OGHeight, ogVerticalBands)
	}
}

func TestOGGeometry_BandsUseMostOfTheCanvas(t *testing.T) {
	total := 0
	for _, b := range ogVerticalBands {
		total += b
	}
	const leastUsed = OGHeight * 9 / 10
	if total < leastUsed {
		t.Fatalf("layout bands total only %dpx of %dpx; the card is mostly empty", total, OGHeight)
	}
}

func TestOGGeometry_AvatarHangsHalfOverTheBanner(t *testing.T) {
	if avatarOverlap != avatarSize/2 {
		t.Fatalf("avatar overhang is %dpx of a %dpx avatar; ProfileCard hangs it by exactly half",
			avatarOverlap, avatarSize)
	}
	if avatarOverlap > bannerHeight {
		t.Fatalf("avatar overhang %dpx exceeds the %dpx banner", avatarOverlap, bannerHeight)
	}
}

// ProfileCard renders an 84px Avatar with radius xl (22px); a 50% radius would mismatch.
func TestOGGeometry_AvatarIsARoundedSquareNotACircle(t *testing.T) {
	if avatarRadius >= avatarSize/2 {
		t.Fatalf("avatar radius %d on a %dpx avatar is a circle; the app uses a rounded square",
			avatarRadius, avatarSize)
	}
	if avatarRadius <= 0 {
		t.Fatalf("avatar radius %d has no rounding at all", avatarRadius)
	}
	want := avatarSize * 22 / 84
	if avatarRadius != want {
		t.Fatalf("avatar radius %d does not keep the app's 22/84 proportion (want %d)", avatarRadius, want)
	}
	css := between(BuildOGTemplate(OGInput{Handle: "a.bsky.social"}), "<style>", "</style>")
	if rule := between(css, ".avatar {", "}"); strings.Contains(rule, "border-radius: 50%") {
		t.Fatalf(".avatar is rendered as a circle:\n%s", rule)
	}
}

func TestOGTemplate_BannerHasNoFadeOrBlur(t *testing.T) {
	css := between(BuildOGTemplate(OGInput{
		Handle: "a.bsky.social",
		Banner: "https://cdn.bsky.app/b.jpg",
	}), "<style>", "</style>")
	scrim := between(css, ".banner::after {", "}")
	if strings.Contains(scrim, "gradient") {
		t.Errorf(".banner::after fades into the surface; the banner should end in a hard cut\n%s", scrim)
	}
	if !strings.Contains(scrim, ogBannerScrim) {
		t.Errorf(".banner::after should carry ProfileCard's flat scrim %q\n%s", ogBannerScrim, scrim)
	}
	// Scan every .banner rule: a `filter: blur()` on `.banner img` once slipped past a narrower scan.
	for _, selector := range bannerSelectors(css) {
		rule := between(css, selector+" {", "}")
		for _, banned := range []string{"blur", "filter", "backdrop"} {
			if strings.Contains(rule, banned) {
				t.Errorf("%s uses %q; the banner photo must render sharp\n%s", selector, banned, rule)
			}
		}
	}
}

func bannerSelectors(css string) []string {
	var out []string
	for _, line := range strings.Split(css, "\n") {
		head, _, ok := strings.Cut(strings.TrimSpace(line), " {")
		if ok && strings.HasPrefix(head, ".banner") {
			out = append(out, head)
		}
	}
	return out
}

func TestOGTemplate_PromptIsClampedNotAllowedToGrow(t *testing.T) {
	html := BuildOGTemplate(OGInput{
		Handle: "a.bsky.social",
		Prompt: strings.Repeat("a very long prompt that will not fit ", 20),
	})
	css := between(html, "<style>", "</style>")
	rule := between(css, ".prompt {", "}")
	for _, want := range []string{"-webkit-line-clamp", "max-height", "overflow: hidden"} {
		if !strings.Contains(rule, want) {
			t.Errorf(".prompt rule lacks %q, so a long prompt can overrun the footer\n%s", want, rule)
		}
	}
}

// contrastRatio mirrors the client contrast test's maths.
func contrastRatio(t *testing.T, fg, bg string) float64 {
	t.Helper()
	l1, l2 := relativeLuminance(t, fg), relativeLuminance(t, bg)
	if l1 < l2 {
		l1, l2 = l2, l1
	}
	return (l1 + 0.05) / (l2 + 0.05)
}

func relativeLuminance(t *testing.T, hex string) float64 {
	t.Helper()
	var r, g, b int
	if _, err := fmt.Sscanf(strings.TrimPrefix(hex, "#"), "%02x%02x%02x", &r, &g, &b); err != nil {
		t.Fatalf("colour %q is not #rrggbb: %v", hex, err)
	}
	channel := func(v int) float64 {
		c := float64(v) / 255
		if c <= 0.04045 {
			return c / 12.92
		}
		return math.Pow((c+0.055)/1.055, 2.4)
	}
	return 0.2126*channel(r) + 0.7152*channel(g) + 0.0722*channel(b)
}

func splitFontStack(stack string) []string {
	parts := strings.Split(stack, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		out = append(out, strings.Trim(strings.TrimSpace(p), "'\""))
	}
	return out
}

func between(s, open, close string) string {
	i := strings.Index(s, open)
	if i < 0 {
		return ""
	}
	rest := s[i+len(open):]
	j := strings.Index(rest, close)
	if j < 0 {
		return ""
	}
	return rest[:j]
}
