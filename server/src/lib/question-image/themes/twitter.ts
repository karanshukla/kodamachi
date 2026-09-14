/* v8 ignore start */
import { APP_DOMAIN, APP_NAME } from "#/lib/brand";
/* v8 ignore stop */

import { themeLayout } from "../layout";
import { markTile } from "../mark";
import { BASE_CSS, NOTO_LINK, NOTO_STACK, PRECONNECT } from "../shared-css";
import type { RenderedTemplate } from "../templates";

/** "Post": the question quoted as a paper post from the app's own account. */
export function renderTwitterCard(
  escapedMessage: string,
  footerText: string,
  message: string,
  handle?: string
): RenderedTemplate {
  const { width, height, fontSize } = themeLayout(
    "twitter",
    message,
    handle ? `@${handle} ${message}` : message
  );

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  ${PRECONNECT}
  ${NOTO_LINK}
  <style>
    ${BASE_CSS}
    html, body {
      width: ${width}px;
      height: ${height}px;
      font-family: ${NOTO_STACK};
    }
    body {
      background: #ffffff;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #ffffff;
      border: 1px solid #C9D5EA;
      border-radius: 14px;
      padding: 14px 16px 12px;
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .tweet-body {
      display: flex;
      flex-direction: column;
    }
    .top {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
      margin-bottom: 10px;
    }
    .mark { flex-shrink: 0; }
    .user-info {
      flex: 1;
      min-width: 0;
    }
    .user-name {
      font-size: 14px;
      font-weight: 600;
      color: #111C36;
      line-height: 1.3;
    }
    .user-handle {
      font-size: 13px;
      color: #63708C;
      line-height: 1.3;
    }
    .content {
      overflow: visible;
    }
    .mention {
      color: #234B94;
      font-weight: 400;
    }
    .message {
      color: #111C36;
      font-size: ${fontSize}px;
      font-weight: 400;
      line-height: 1.45;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }
    .footer {
      font-size: 12px;
      color: #234B94;
      flex-shrink: 0;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #EEF1F6;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="tweet-body">
      <div class="top">
        ${markTile(36, "#10224A", "#FFFFFF")}
        <div class="user-info">
          <div class="user-name">${APP_NAME}</div>
          <div class="user-handle">@${APP_DOMAIN}</div>
        </div>
      </div>
      <div class="content">
        <div class="message">${handle ? `<span class="mention">@${handle}</span> ` : ""}${escapedMessage}</div>
      </div>
    </div>
    <div class="footer">${footerText}</div>
  </div>
</body>
</html>`;
  return { html, width, height, fontSize };
}

/**
 * Picks the template for a stored `imageTheme`. `escapedMessage` is HTML-safe;
 * `message` is the raw text, which only the layout reads.
 */
