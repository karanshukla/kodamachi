package shim

import (
	"strings"
	"testing"
	"unicode/utf8"
)

const longName = "This Is A Really Exceptionally Long Display Name That Will Definitely Overflow The 1200 Pixel Wide Canvas Without Truncation Rules In Place And Keeps Going And Going"

const longHandle = "a-very-long-handle-with-many-segments-that-exceeds-the-canvas-width.bsky.social"

func TestBuildOGTemplate_LongDisplayName_HasTruncationCSS(t *testing.T) {
	html := BuildOGTemplate(OGInput{
		DisplayName: longName,
		Handle:      "ok.bsky.social",
		Avatar:      "https://cdn.bsky.app/a.jpg",
		Prompt:      "p",
	})
	if !strings.Contains(html, longName) {
		t.Fatalf("full display name should be present in HTML (CSS truncates, not the source)")
	}
	if !hasTruncationCSS(t, html, ".name") {
		t.Fatalf("template .name rule lacks truncation CSS; long display names will overflow the canvas\n--- CSS excerpt ---\n%s",
			extractCSS(html))
	}
}

func TestBuildOGTemplate_LongHandle_HasTruncationCSS(t *testing.T) {
	html := BuildOGTemplate(OGInput{
		DisplayName: "Ok",
		Handle:      longHandle,
		Avatar:      "https://cdn.bsky.app/a.jpg",
		Prompt:      "p",
	})
	if !strings.Contains(html, longHandle) {
		t.Fatalf("full handle should be present in HTML")
	}
	if !hasTruncationCSS(t, html, ".handle") {
		t.Fatalf("template .handle rule lacks truncation CSS; long handles will overflow\n--- CSS excerpt ---\n%s",
			extractCSS(html))
	}
}

func TestBuildOGTemplate_LongNamesDoNotBreakHTMLStructure(t *testing.T) {
	noSpaces := strings.Repeat("W", 500)
	html := BuildOGTemplate(OGInput{
		DisplayName: noSpaces,
		Handle:      strings.Repeat("h", 300),
		Prompt:      "p",
	})
	for _, want := range []string{"<!DOCTYPE html>", "</html>", "1200", "630"} {
		if !strings.Contains(html, want) {
			t.Fatalf("long-name HTML missing %q\n--- html tail ---\n%s", want, tail(html, 200))
		}
	}
}

func TestBuildOGTemplate_NotoFontStacksPresent(t *testing.T) {
	html := BuildOGTemplate(OGInput{
		DisplayName: "Test",
		Handle:      "test.bsky.social",
		Prompt:      "p",
	})
	for _, want := range []string{
		"Noto Sans",
		"Noto Sans JP", // Japanese
		"Noto Sans KR", // Korean
		"Noto Sans SC", // Simplified Chinese
		"Noto Sans TC", // Traditional Chinese
		"Noto Sans Arabic",
		"Noto Sans Devanagari",
		"Noto Sans Hebrew",
		"Noto Sans Thai",
		"Noto Color Emoji",
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("template missing font %q — non-Latin coverage lost\n--- font line ---\n%s",
				want, extractFontLine(html))
		}
	}
}

func TestBuildOGTemplate_NonLatinDisplayName_PreservedAndGlyphWorks(t *testing.T) {
	cases := []struct {
		name      string
		display   string
		wantFirst string // expected first-rune glyph (uppercased where sensible)
	}{
		{"Cyrillic", "Привет Мир", "П"},
		{"Japanese", "こんにちは", "こ"},
		{"ChineseSimplified", "你好世界", "你"},
		{"Korean", "안녕하세요", "안"},
		{"Arabic", "مرحبا بالعالم", "م"},
		{"Hebrew", "שלום עולם", "ש"},
		{"Devanagari", "नमस्ते दुनिया", "न"},
		{"Thai", "สวัสดีชาวโลก", "ส"},
		{"Emoji", "👋🌍 Hello", "👋"},
		{"MixedLatinEmoji", "Alice 🚀", "A"},
		{"RTL Arabic long", "محمد عبد الله الراشد", "م"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			withAvatar := BuildOGTemplate(OGInput{
				DisplayName: tc.display,
				Handle:      "test.bsky.social",
				Avatar:      "https://cdn.bsky.app/a.jpg",
				Prompt:      "p",
			})
			if !strings.Contains(withAvatar, tc.display) {
				t.Fatalf("display name %q not preserved verbatim in HTML", tc.display)
			}

			noAvatar := BuildOGTemplate(OGInput{
				DisplayName: tc.display,
				Handle:      "test.bsky.social",
				Avatar:      "",
				Prompt:      "p",
			})
			if !strings.Contains(noAvatar, tc.wantFirst) {
				t.Fatalf("glyph fallback: want first rune %q in output, missing\n--- avatar element ---\n%s",
					tc.wantFirst, extractAvatarEl(noAvatar))
			}
		})
	}
}

func TestFirstGlyph_RuneAwareNotByteAware(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"Alice", "A"},
		{"alice", "A"}, // uppercased
		{"", ""},       // empty safe
		{"  spaceman", "S"},
		{"こんにちは", "こ"},
		{"👋hi", "👋"},
		{"Привет", "П"},
		{"مرحبا", "م"},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got := firstGlyph(tc.in)
			if got != tc.want {
				t.Fatalf("firstGlyph(%q) = %q, want %q", tc.in, got, tc.want)
			}
			if !utf8.ValidString(got) {
				t.Fatalf("firstGlyph(%q) = %q is not valid UTF-8", tc.in, got)
			}
		})
	}
}

func TestFirstGlyph_EmptyReturnsEmpty(t *testing.T) {
	for _, in := range []string{"", "   ", "\t\n"} {
		if got := firstGlyph(in); got != "" {
			t.Fatalf("firstGlyph(%q) = %q, want empty", in, got)
		}
	}
}

func TestBuildOGTemplate_RTLDisplayName_StructureIntact(t *testing.T) {
	html := BuildOGTemplate(OGInput{
		DisplayName: "محمد والعائلة",
		Handle:      "mohamed.bsky.social",
		Avatar:      "https://cdn.bsky.app/a.jpg",
		Prompt:      "p",
	})
	for _, want := range []string{"<!DOCTYPE html>", "</html>", "<body>", "</body>"} {
		if !strings.Contains(html, want) {
			t.Fatalf("RTL name broke HTML structure; missing %q", want)
		}
	}
	if !strings.Contains(html, "محمد والعائلة") {
		t.Fatalf("RTL display name not preserved in HTML")
	}
}

func hasTruncationCSS(t *testing.T, html, selector string) bool {
	t.Helper()
	css := extractCSS(html)
	idx := strings.Index(css, selector)
	if idx < 0 {
		return false
	}
	braceStart := strings.IndexByte(css[idx:], '{')
	if braceStart < 0 {
		return false
	}
	rule := css[idx+braceStart:]
	braceEnd := strings.IndexByte(rule, '}')
	if braceEnd < 0 {
		rule = rule[braceStart:]
	} else {
		rule = rule[:braceEnd]
	}
	hasWidth := strings.Contains(rule, "max-width") || strings.Contains(rule, "width")
	hasOverflow := strings.Contains(rule, "overflow:") || strings.Contains(rule, "overflow-hidden")
	hasEllipsis := strings.Contains(rule, "text-overflow") || strings.Contains(rule, "ellipsis")
	return hasWidth && hasOverflow && hasEllipsis
}

func extractCSS(html string) string {
	start := strings.Index(html, "<style>")
	end := strings.Index(html, "</style>")
	if start < 0 || end < 0 || end < start {
		return ""
	}
	return html[start:end]
}

func extractFontLine(html string) string {
	for _, line := range strings.Split(html, "\n") {
		if strings.Contains(line, "font-family") {
			return line
		}
	}
	return ""
}

func extractAvatarEl(html string) string {
	start := strings.Index(html, `<div class="avatar">`)
	if start < 0 {
		start = strings.Index(html, `<img class="avatar"`)
	}
	if start < 0 {
		return ""
	}
	rest := html[start:]
	end := strings.Index(rest, "</div>")
	if end < 0 {
		end = strings.Index(rest, "/>")
	}
	if end < 0 {
		return rest
	}
	return rest[:end]
}

func tail(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[len(s)-n:]
}
