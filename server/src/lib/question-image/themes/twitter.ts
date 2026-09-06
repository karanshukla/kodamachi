/* v8 ignore start */
import { APP_DOMAIN, APP_NAME } from "#/lib/brand";
/* v8 ignore stop */

import { themeLayout } from "../layout";
import { LOGO_DATA_URL } from "../logo";
import { BASE_CSS, NOTO_LINK, NOTO_STACK, PRECONNECT } from "../shared-css";
import type { RenderedTemplate } from "../templates";

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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', ${NOTO_STACK};
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
      border: 1px solid #cfd9de;
      border-radius: 16px;
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
    .avatar {
      width: 36px;
      height: 36px;
      min-width: 36px;
      border-radius: 50%;
      overflow: hidden;
      background: #1d9bf0;
    }
    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .user-info {
      flex: 1;
      min-width: 0;
    }
    .name-row {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .user-name {
      font-size: 14px;
      font-weight: 700;
      color: #0f1419;
      line-height: 1.3;
    }
    .verified {
      color: #1d9bf0;
      font-size: 14px;
      line-height: 1.3;
    }
    .user-handle {
      font-size: 13px;
      color: #536471;
      line-height: 1.3;
    }
    .content {
      overflow: visible;
    }
    .mention {
      color: #1d9bf0;
      font-weight: 400;
    }
    .message {
      color: #0f1419;
      font-size: ${fontSize}px;
      font-weight: 400;
      line-height: 1.45;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }
    .footer {
      font-size: 12px;
      color: #1d9bf0;
      flex-shrink: 0;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #eff3f4;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="tweet-body">
      <div class="top">
        <div class="avatar">${
          /* v8 ignore next */
          LOGO_DATA_URL ? `<img src="${LOGO_DATA_URL}" alt="${APP_NAME} logo" />` : "NF"
        }</div>
        <div class="user-info">
          <div class="name-row">
            <span class="user-name">${APP_NAME} - Anonymous QnA</span>
            <span class="verified">🔷📩</span>
          </div>
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
