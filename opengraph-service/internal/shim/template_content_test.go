package shim

import (
	"strings"
	"testing"
)

func TestBuildOGTemplate_NoDisplayName_DoesNotPrintTheHandleTwice(t *testing.T) {
	html := BuildOGTemplate(OGInput{DisplayName: "", Handle: "dave.bsky.social"})
	meta := between(html, `<div class="meta">`, `</div>
    </div>`)
	if n := strings.Count(meta, "dave.bsky.social"); n != 1 {
		t.Fatalf("handle appears %d times in the identity block; with no display name it is already the headline\n%s", n, meta)
	}
	if strings.Contains(meta, `class="handle"`) {
		t.Fatal("the @handle row should be omitted when the headline is already the handle")
	}
}

func TestBuildOGTemplate_WithDisplayName_ShowsNameAndHandleRows(t *testing.T) {
	html := BuildOGTemplate(OGInput{DisplayName: "Dave Lister", Handle: "dave.bsky.social"})
	if !strings.Contains(html, `class="handle"`) {
		t.Fatal("the @handle row should be present alongside a display name")
	}
	if !strings.Contains(html, "Dave Lister") || !strings.Contains(html, "@dave.bsky.social") {
		t.Fatalf("both the name and the @handle should render\n%s", between(html, `class="meta"`, "</div>\n    </div>"))
	}
}

func TestBuildOGTemplate_HandleAtPrefixIsNotDoubled(t *testing.T) {
	html := BuildOGTemplate(OGInput{DisplayName: "Dave", Handle: "@dave.bsky.social"})
	if strings.Contains(html, "@@") {
		t.Fatal("leading @ on the handle was not trimmed before the template added its own")
	}
}

// Single-pass strings.Replacer: a slot marker in a profile field is inserted literally, not re-expanded.
func TestBuildOGTemplate_UserContentCannotInjectTemplateSlots(t *testing.T) {
	html := BuildOGTemplate(OGInput{
		DisplayName: "{{CHIP_BG}}",
		Handle:      "x.bsky.social",
		Prompt:      "{{FONT_STACK}}",
	})
	if !strings.Contains(html, "{{CHIP_BG}}") {
		t.Fatal("a display name that looks like a slot should render as literal text")
	}
	if !strings.Contains(html, "{{FONT_STACK}}") {
		t.Fatal("a prompt that looks like a slot should render as literal text")
	}
}

func TestBuildOGTemplate_LeavesNoUnfilledSlots(t *testing.T) {
	html := BuildOGTemplate(OGInput{
		DisplayName: "Alice",
		Handle:      "alice.bsky.social",
		Banner:      "https://cdn.bsky.app/b.jpg",
		Avatar:      "https://cdn.bsky.app/a.jpg",
		Prompt:      "Ask away",
	})
	for _, marker := range []string{"{{", "}}"} {
		if strings.Contains(html, marker) {
			t.Fatalf("template still contains %q — a slot went unreplaced\n%s",
				marker, contextAround(html, marker))
		}
	}
}

func TestBuildOGTemplate_FooterShowsTheUsersShareLink(t *testing.T) {
	html := BuildOGTemplate(OGInput{DisplayName: "Alice", Handle: "alice.bsky.social"})
	chip := between(html, `<div class="chip">`, "</div>")
	if !strings.Contains(chip, "kodamachi.online/") {
		t.Fatalf("footer should carry the share domain, got %q", chip)
	}
	if !strings.Contains(chip, "alice.bsky.social") {
		t.Fatalf("footer link should name the profile, got %q", chip)
	}
	if !strings.Contains(html, `<div class="wordmark">`+AppName+`</div>`) {
		t.Fatal("the wordmark should still be in the footer")
	}
}

func TestBuildOGTemplate_ShareLinkUsesTheTrimmedHandle(t *testing.T) {
	html := BuildOGTemplate(OGInput{DisplayName: "Alice", Handle: "@alice.bsky.social"})
	chip := between(html, `<div class="chip">`, "</div>")
	if strings.Contains(chip, "kodamachi.online/@") {
		t.Fatalf("share link should not carry the handle's leading @, got %q", chip)
	}
}

func TestBuildOGTemplate_ShareLinkEscapesTheHandle(t *testing.T) {
	html := BuildOGTemplate(OGInput{DisplayName: "X", Handle: `a"><script>alert(1)</script>`})
	if strings.Contains(html, "<script>") {
		t.Fatal("handle reached the share link unescaped")
	}
}

func TestBuildOGTemplate_ShareLinkPillTruncates(t *testing.T) {
	css := between(BuildOGTemplate(OGInput{Handle: "a.bsky.social"}), "<style>", "</style>")
	rule := between(css, ".chip {", "}")
	for _, want := range []string{"min-width: 0", "overflow: hidden", "text-overflow: ellipsis"} {
		if !strings.Contains(rule, want) {
			t.Errorf(".chip rule lacks %q, so a long handle can widen the footer past the canvas\n%s", want, rule)
		}
	}
}

func TestSafeImageURL(t *testing.T) {
	accepted := []string{
		"https://cdn.bsky.app/img/avatar/plain/did:plc:abc/bafy@jpeg",
		"http://localhost:3033/banner.png",
		"https://cdn.bsky.app/a.jpg?width=100&h=2",
	}
	for _, in := range accepted {
		if got := safeImageURL(in); got == "" {
			t.Errorf("safeImageURL(%q) = \"\", want the URL kept", in)
		}
	}

	rejected := map[string]string{
		"empty":               "",
		"whitespace only":     "   ",
		"javascript scheme":   "javascript:alert(1)",
		"data scheme":         "data:image/svg+xml,<svg onload=alert(1)>",
		"protocol relative":   "//evil.example/x.png",
		"relative path":       "/local/x.png",
		"embedded newline":    "https://cdn.bsky.app/a.jpg\nx",
		"embedded tab":        "https://cdn.bsky.app/a.jpg\tx",
		"embedded space":      "https://cdn.bsky.app/a.jpg x",
		"embedded nul":        "https://cdn.bsky.app/a.jpg\x00",
		"embedded delete":     "https://cdn.bsky.app/a.jpg\x7f",
		"uppercase js scheme": "JavaScript:alert(1)",
	}
	for name, in := range rejected {
		if got := safeImageURL(in); got != "" {
			t.Errorf("%s: safeImageURL(%q) = %q, want \"\"", name, in, got)
		}
	}

	if got := safeImageURL(`https://cdn.bsky.app/a.jpg?x="onerror="alert(1)`); strings.Contains(got, `"`) {
		t.Errorf("raw quote survived escaping: %q", got)
	}
}

func TestBuildOGTemplate_RejectedURLsFallBackToTheBrandTreatment(t *testing.T) {
	html := BuildOGTemplate(OGInput{
		DisplayName: "Eve",
		Handle:      "eve.bsky.social",
		Banner:      "javascript:alert(1)",
		Avatar:      "javascript:alert(1)",
	})
	if strings.Contains(html, "javascript:") {
		t.Fatal("a javascript: URL reached the rendered markup")
	}
	if strings.Contains(strings.Replace(html, brandMark, "", 1), "<img") {
		t.Fatal("no <img> besides the brand mark should be emitted when both URLs are refused")
	}
	if !strings.Contains(html, `<div class="avatar">E</div>`) {
		t.Fatalf("expected the glyph fallback avatar\n%s", between(html, `class="identity"`, "</div>"))
	}
}

func contextAround(s, needle string) string {
	i := strings.Index(s, needle)
	if i < 0 {
		return ""
	}
	start := max(0, i-80)
	end := min(len(s), i+80)
	return s[start:end]
}
