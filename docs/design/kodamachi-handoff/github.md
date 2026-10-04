repo: karanshukla/navyfragen-app
branch: main
path: client/src

## Last sync

date: 2026-08-23T16:31:26Z

### Updated in this project

- Read the full client UI: theme, tokens, layout shell, all 8 pages and every component.
- Read the generated-image sources: image-generator.ts themes and the Go OG template.
- Read the PWA/service-worker surfaces: sw.ts push handling, manifest config, WAF interstitial, bouncing-mark easter egg.
- Rebranding Navyfragen → Kodamachi: white / dark-blue, light-mode-centric, no gradients.

## Screen map

| Project screen | Repo files |
|---|---|
| App shell (header, sidebar, boundary) | client/src/AppLayout.tsx, Navigation.tsx, Navigation.styles.ts, components/AppHeader.tsx, components/header/UserMenu.tsx, components/nav/FriendSection.tsx, components/nav/MessageCountBadge.tsx, index.css |
| Design tokens / theme | client/src/Theme.tsx, styles/tokens.ts, index.css, lib/themes.ts, lib/brand.ts |
| Home (signed in + out) | client/src/pages/Home.tsx, Home.styles.ts, components/ShortcutList.tsx, components/WinkMark.tsx, components/Wordmark.tsx |
| Login | client/src/pages/Login.tsx, components/AuthPanel.tsx, components/login/HandleSuggestions.tsx |
| OAuth callback | client/src/pages/OAuthCallback.tsx |
| Messages inbox | client/src/pages/Messages.tsx, components/messages/* (InboxLinkCard, QuestionGrid, QuestionCard, ReplyComposer, CharRing, CollapsibleCard, PostingPreferences, ImageThemePicker, ImageThemePreview) |
| Customise | client/src/pages/Customise.tsx, components/customise/*, components/SettingsCard.tsx, components/SettingsToggle.tsx |
| Settings | client/src/pages/Settings.tsx, components/settings/AccountOverview.tsx, components/PushNotificationsCard.tsx, components/SettingsCard.tsx |
| Public profile / ask | client/src/pages/PublicProfile.tsx, components/profile/* (ProfileUrlBar, ProfileCard, AskCard, ProfileNotice, ProfileSkeleton) |
| System surfaces (push, PWA shell, WAF page, bot profile) | client/src/sw.ts, client/src/pushPayload.ts, client/src/lib/wafInterstitial.ts, client/src/lib/bounceLogos.ts, client/src/components/BouncingLogos.tsx, client/vite.config.ts, anubis/ |
| Generated images (question PNG, OG link card, icons) | server/src/lib/image-generator.ts, html-to-image/app.js, opengraph-service/internal/shim/template.go, opengraph-service/internal/shim/brand.go, client/index.html |
| Shared chrome | client/src/components/ConfirmationModal.tsx, ShareButton.tsx, SwatchButton.tsx, UpdateAvailableButton.tsx |
