package shim

import (
	"fmt"
	"html"
	"math"
	"strconv"
	"strings"
)

// OGWidth and OGHeight are the Open Graph image dimensions.
const (
	OGWidth  = 1200
	OGHeight = 630
)

// OGInput is the data the composite template renders.
type OGInput struct {
	DisplayName string
	Handle      string
	Banner      string
	Avatar      string
	Prompt      string
	Locale      string
}

// DefaultPrompt is the last-resort headline. It is short because Bluesky
// downscales the card ~2.4x.
const DefaultPrompt = "Ask me anything, anonymously"

// touchpointPrompts is the localized default headline, one per locale in
// client/src/lib/touchpointTranslations.ts. These are translations of
// DefaultPrompt, not the client's strings, which take a display name or drop
// "anonymously". [TestResolvePrompt_LocalizedDefault_UsesCatalogWhenNoCustomPrompt]
// pins the lookup; [TestTouchpointPrompts_CoversEveryTouchpointLocale] pins
// that the map matches the TS locale list.
var touchpointPrompts = map[string]string{
	"en": DefaultPrompt,
	"es": "Pregúntame algo, anónimamente",
	"pt": "Pergunte-me algo, anonimamente",
	"de": "Frag mich alles, anonym",
	"fr": "Demande-moi tout, anonymement",
}

// resolvePrompt picks the trimmed customPrompt, else the localized default,
// else DefaultPrompt. [TestResolvePrompt_CustomPrompt_TakesPrecedenceOverLocale]
// and [TestResolvePrompt_UnrecognizedLocale_FallsBackToEnglish] pin both ends.
func resolvePrompt(customPrompt, locale string) string {
	if p := strings.TrimSpace(customPrompt); p != "" {
		return p
	}
	if p, ok := touchpointPrompts[primarySubtag(locale)]; ok {
		return p
	}
	return DefaultPrompt
}

// primarySubtag returns the language of a BCP-47 tag, as the TS side does:
// "pt-BR" reads the pt prompt. [TestResolvePrompt_RegionalVariant_UsesItsLanguage]
// pins it.
func primarySubtag(locale string) string {
	if i := strings.Index(locale, "-"); i >= 0 {
		locale = locale[:i]
	}
	return strings.ToLower(locale)
}

// The palette mirrors client/src/index.css's light-scheme tokens.
// [TestOGPalette_EveryTextColourClearsAAOnEverySurface] checks every text colour
// against every surface, and [TestOGTemplate_NoTextSitsOnTheBanner] pins that
// no text sits on the banner, which makes that check exhaustive.
const (
	// ogFillNavy matches --ds-fill-ink.
	ogFillNavy = "#10224A"

	ogSurface = "#FFFFFF"

	ogText      = "#111C36" // --ds-ink
	ogTextMuted = "#63708C"

	// Solid rather than alpha so their contrast is fixed for the test.
	ogChipBG   = "#F4F6FA"
	ogHairline = "#E3E8F0"

	ogAvatarGlyph = "#FFFFFF"

	// Copied from ProfileCard.styles.ts's bannerScrim; keeps the avatar ring
	// readable on a bright photo.
	ogBannerScrim = "rgba(0,0,0,0.2)"
)

// ogSurfaces / ogTextColors enumerate the palette for the contrast test: every
// text colour must clear AA against every surface it can land on.
var (
	ogSurfaces   = []string{ogSurface, ogChipBG}
	ogTextColors = []string{ogText, ogTextMuted, ogFillNavy}
)

// ogFontStack leads with Noto rather than the app's system stack, which would
// resolve to a different face per container.
// [TestOGFontStack_LeadsWithNotoNotABrandWebfont] pins that.
//
// 'Noto Color Emoji' MUST stay last: its U+0020 advance is 1.25em, so any
// earlier position blows out every space when the webfonts are unavailable.
// [TestOGFontStack_EmojiFamilyIsLast] pins the ordering.
const ogFontStack = `'Noto Sans', 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC', 'Noto Sans Arabic', 'Noto Sans Devanagari', 'Noto Sans Hebrew', 'Noto Sans Thai', 'Liberation Sans', 'DejaVu Sans', sans-serif, 'Noto Color Emoji'`

// ogFontLink loads the webfonts in ogFontStack.
const ogFontLink = `<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&family=Noto+Sans+JP:wght@400;700&family=Noto+Sans+KR:wght@400;700&family=Noto+Sans+SC:wght@400;700&family=Noto+Sans+TC:wght@400;700&family=Noto+Sans+Arabic:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&family=Noto+Sans+Hebrew:wght@400;700&family=Noto+Sans+Thai:wght@400;700&family=Noto+Color+Emoji&display=swap" rel="stylesheet">`

// The canvas is fixed at 1200x630, so the bands must add up or the prompt
// grows over the footer. [TestOGGeometry_VerticalBandsFitTheCanvas] adds them up.
const (
	bannerHeight  = 170
	gutter        = 64
	avatarSize    = 124
	contentPadBot = 44

	nameFontSize     = 50
	nameLineHeight   = 110
	avatarToNameGap  = 14
	handleFontSize   = 27
	handleLineHeight = 135

	promptGap        = 28
	promptFontSize   = 56
	promptLineHeight = 115
	promptMaxLines   = 2

	footerPadTop = 26
	footerBorder = 2
	markSize     = 44

	chipFontSize   = 24
	chipLineHeight = 100
	chipPadY       = 12
	chipPadX       = 22
	chipBorder     = 2
	chipRadiusPx   = 999

	hairlineWidth = footerBorder
)

// lineBox is the height of a line, from a line-height percentage as the CSS states it.
func lineBox(fontSize, lineHeightPct int) int {
	return int(math.Ceil(float64(fontSize) * float64(lineHeightPct) / 100))
}

// cssLineHeight renders a line-height percentage as the unitless ratio CSS takes.
func cssLineHeight(pct int) string {
	return strconv.FormatFloat(float64(pct)/100, 'f', -1, 64)
}

var (
	nameLineBox   = lineBox(nameFontSize, nameLineHeight)
	handleLineBox = lineBox(handleFontSize, handleLineHeight)
	promptLineBox = lineBox(promptFontSize, promptLineHeight)

	// Chip padding and border sit outside its line box.
	footerRowBox = lineBox(chipFontSize, chipLineHeight) + 2*(chipPadY+chipBorder)
)

// avatarOverlap is how far the avatar overhangs the banner, as in ProfileCard.styles.ts.
const avatarOverlap = avatarSize / 2

// avatarRadius scales ProfileCard's 22px radius on an 84px avatar.
// [TestOGGeometry_AvatarIsARoundedSquareNotACircle] pins that it is not a circle.
const avatarRadius = avatarSize * 22 / 84

// ogVerticalBands lists the bands down the canvas; the avatar counts only below the seam.
var ogVerticalBands = []int{
	bannerHeight,
	avatarSize - avatarOverlap,
	avatarToNameGap,
	nameLineBox,
	handleLineBox,
	promptGap,
	promptMaxLines * promptLineBox,
	footerPadTop + footerBorder + footerRowBox,
	contentPadBot,
}

// promptMaxHeight backs up -webkit-line-clamp, which counts lines, not pixels.
var promptMaxHeight = promptMaxLines * promptLineBox

// shareDomain is the share-link domain PublicProfile.tsx and ProfileUrlBar.tsx use.
const shareDomain = "kodamachi.online"

// brandMark is the app's mark inlined as a data URI so it needs no network. It is
// built by concatenation because the single-pass Replacer would insert a slot
// in a substituted value literally ([TestBuildOGTemplate_LeavesNoUnfilledSlots]).
var brandMark = `<img class="mark" src="` + MarkDataURI + `" alt="" aria-hidden="true">`

// ogTemplate is expanded by a strings.Replacer, not fmt.Sprintf, because the
// CSS is full of percentages.
const ogTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{{FONT_LINK}}
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: {{W}}px; height: {{H}}px; overflow: hidden; }
  body {
    font-family: {{FONT_STACK}};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-synthesis: none;
    background: {{SURFACE}};
    color: {{TEXT}};
    display: flex;
    flex-direction: column;
  }

  .banner {
    position: relative;
    height: {{BANNER_H}}px;
    flex-shrink: 0;
    background: {{FILL_NAVY}};
    overflow: hidden;
  }
  .banner img {
    width: 100%; height: 100%;
    object-fit: cover; object-position: center;
    display: block;
  }
  .banner::after {
    content: "";
    position: absolute; inset: 0;
    background: {{BANNER_SCRIM}};
  }

  /* Must be positioned to paint above .banner (position:relative), or the
     banner's overflow:hidden clips the avatar overhang. */
  .content {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 {{GUTTER}}px {{PAD_BOT}}px;
  }

  .identity {
    margin-top: -{{AVATAR_OVERLAP}}px;
    min-width: 0;
  }
  .avatar {
    width: {{AVATAR}}px; height: {{AVATAR}}px;
    border-radius: {{AVATAR_RADIUS}}px;
    object-fit: cover;
    background: {{FILL_NAVY}};
    border: 6px solid {{SURFACE}};
    display: flex; align-items: center; justify-content: center;
    color: {{AVATAR_GLYPH}};
    font-size: 58px; font-weight: 600; line-height: 1;
  }
  .meta {
    min-width: 0;
    padding-top: {{NAME_GAP}}px;
  }
  .name {
    font-size: {{NAME_FS}}px; font-weight: 600; line-height: {{NAME_LH}};
    letter-spacing: -0.03em;
    max-width: 900px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  }
  .handle {
    font-size: {{HANDLE_FS}}px; font-weight: 400; line-height: {{HANDLE_LH}};
    color: {{TEXT_MUTED}};
    max-width: 900px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  }

  /* Absorbs the leftover space and centres the prompt in it. */
  .prompt-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    padding-top: {{PROMPT_GAP}}px;
  }
  .prompt {
    font-size: {{PROMPT_FS}}px; font-weight: 600; line-height: {{PROMPT_LH}};
    letter-spacing: -0.03em;
    color: {{FILL_NAVY}};
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: {{PROMPT_LINES}};
    max-width: 1010px;
    max-height: {{PROMPT_MAX_H}}px;
    overflow: hidden;
  }

  .footer {
    display: flex; align-items: center; justify-content: space-between;
    gap: 24px;
    padding-top: {{FOOTER_PAD}}px;
    border-top: {{HAIRLINE_W}}px solid {{HAIRLINE}};
  }
  .brand { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
  .mark { width: {{MARK_SIZE}}px; height: {{MARK_SIZE}}px; flex-shrink: 0; }
  .wordmark {
    font-size: 30px; font-weight: 600; letter-spacing: -0.03em; line-height: 1;
  }
  .chip {
    min-width: 0;
    background: {{CHIP_BG}};
    border: {{CHIP_BORDER}}px solid {{HAIRLINE}};
    color: {{TEXT_MUTED}};
    font-size: {{CHIP_FS}}px; font-weight: 400; line-height: {{CHIP_LH}};
    padding: {{CHIP_PAD_Y}}px {{CHIP_PAD_X}}px;
    border-radius: {{CHIP_RADIUS}}px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .chip b { color: {{TEXT}}; font-weight: 600; }
</style>
</head>
<body>
  <div class="banner">{{BANNER_IMG}}</div>
  <div class="content">
    <div class="identity">
      {{AVATAR_EL}}
      <div class="meta">
        <div class="name">{{NAME}}</div>
        {{HANDLE_ROW}}
      </div>
    </div>
    <div class="prompt-wrap"><div class="prompt">{{PROMPT}}</div></div>
    <div class="footer">
      <div class="brand">
        {{MARK_SVG}}
        <div class="wordmark">{{WORDMARK}}</div>
      </div>
      <div class="chip">{{SHARE_LINK}}</div>
    </div>
  </div>
</body>
</html>`

// BuildOGTemplate renders the 1200x630 card HTML. User-supplied strings are
// HTML-escaped and remote URLs go through safeImageURL, since a headless
// browser renders the output.
func BuildOGTemplate(in OGInput) string {
	prompt := resolvePrompt(in.Prompt, in.Locale)

	handle := strings.TrimPrefix(strings.TrimSpace(in.Handle), "@")

	// [TestBuildOGTemplate_NoDisplayName_DoesNotPrintTheHandleTwice] pins that
	// the handle is not printed twice.
	name := strings.TrimSpace(in.DisplayName)
	handleRow := fmt.Sprintf(`<div class="handle">@%s</div>`, html.EscapeString(handle))
	if name == "" {
		name = handle
		handleRow = ""
	}

	shareLink := fmt.Sprintf("%s/<b>%s</b>", shareDomain, html.EscapeString(handle))

	// Single-pass, so a "{{...}}" in user content is inserted literally.
	// [TestBuildOGTemplate_UserContentCannotInjectTemplateSlots] pins that.
	return strings.NewReplacer(
		"{{FONT_LINK}}", ogFontLink,
		"{{FONT_STACK}}", ogFontStack,
		"{{W}}", fmt.Sprint(OGWidth),
		"{{H}}", fmt.Sprint(OGHeight),
		"{{FILL_NAVY}}", ogFillNavy,
		"{{AVATAR_GLYPH}}", ogAvatarGlyph,
		"{{WORDMARK}}", AppName,
		"{{SURFACE}}", ogSurface,
		"{{TEXT}}", ogText,
		"{{TEXT_MUTED}}", ogTextMuted,
		"{{CHIP_BG}}", ogChipBG,
		"{{HAIRLINE}}", ogHairline,
		"{{BANNER_H}}", fmt.Sprint(bannerHeight),
		"{{GUTTER}}", fmt.Sprint(gutter),
		"{{AVATAR}}", fmt.Sprint(avatarSize),
		"{{AVATAR_OVERLAP}}", fmt.Sprint(avatarOverlap),
		"{{AVATAR_RADIUS}}", fmt.Sprint(avatarRadius),
		"{{NAME_GAP}}", fmt.Sprint(avatarToNameGap),
		"{{BANNER_SCRIM}}", ogBannerScrim,
		"{{PAD_BOT}}", fmt.Sprint(contentPadBot),
		"{{NAME_FS}}", fmt.Sprint(nameFontSize),
		"{{NAME_LH}}", cssLineHeight(nameLineHeight),
		"{{HANDLE_FS}}", fmt.Sprint(handleFontSize),
		"{{HANDLE_LH}}", cssLineHeight(handleLineHeight),
		"{{PROMPT_GAP}}", fmt.Sprint(promptGap),
		"{{PROMPT_FS}}", fmt.Sprint(promptFontSize),
		"{{PROMPT_LH}}", cssLineHeight(promptLineHeight),
		"{{CHIP_FS}}", fmt.Sprint(chipFontSize),
		"{{CHIP_LH}}", cssLineHeight(chipLineHeight),
		"{{CHIP_PAD_Y}}", fmt.Sprint(chipPadY),
		"{{CHIP_PAD_X}}", fmt.Sprint(chipPadX),
		"{{CHIP_BORDER}}", fmt.Sprint(chipBorder),
		"{{PROMPT_LINES}}", fmt.Sprint(promptMaxLines),
		"{{PROMPT_MAX_H}}", fmt.Sprint(promptMaxHeight),
		"{{FOOTER_PAD}}", fmt.Sprint(footerPadTop),
		"{{HAIRLINE_W}}", fmt.Sprint(hairlineWidth),
		"{{CHIP_RADIUS}}", fmt.Sprint(chipRadiusPx),
		"{{MARK_SVG}}", brandMark,
		"{{MARK_SIZE}}", fmt.Sprint(markSize),
		"{{BANNER_IMG}}", buildBannerElement(in.Banner),
		"{{AVATAR_EL}}", buildAvatarElement(in.Avatar, in.DisplayName, in.Handle),
		"{{NAME}}", html.EscapeString(name),
		"{{HANDLE_ROW}}", handleRow,
		"{{SHARE_LINK}}", shareLink,
		"{{PROMPT}}", html.EscapeString(prompt),
	).Replace(ogTemplate)
}

// buildBannerElement returns the banner <img>, or "" so the .banner background shows.
func buildBannerElement(bannerURL string) string {
	url := safeImageURL(bannerURL)
	if url == "" {
		return ""
	}
	return fmt.Sprintf(`<img src=%q alt="">`, url)
}

// buildAvatarElement returns the avatar <img>, or a tile with the first letter
// of the name (or handle) when the URL is missing or unusable.
func buildAvatarElement(avatarURL, displayName, handle string) string {
	if url := safeImageURL(avatarURL); url != "" {
		return fmt.Sprintf(`<img class="avatar" src=%q alt="">`, url)
	}
	glyph := firstGlyph(displayName)
	if glyph == "" {
		glyph = firstGlyph(handle)
	}
	return fmt.Sprintf(`<div class="avatar">%s</div>`, html.EscapeString(glyph))
}

// safeImageURL returns the escaped URL if it is a plain http(s) URL, else "".
// Profile fields come from a third-party PDS, so javascript:/data: schemes and
// whitespace or control characters are refused. [TestSafeImageURL] pins the shapes.
func safeImageURL(raw string) string {
	u := strings.TrimSpace(raw)
	if u == "" {
		return ""
	}
	if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
		return ""
	}
	if strings.ContainsFunc(u, func(r rune) bool { return r <= ' ' || r == 0x7f }) {
		return ""
	}
	return html.EscapeString(u)
}

// firstGlyph returns the first rune of s, uppercased.
func firstGlyph(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	r := []rune(s)
	if len(r) == 0 {
		return ""
	}
	return strings.ToUpper(string(r[0]))
}
