import { themeLayout } from "../layout";
import { markTile } from "../mark";
import { BASE_CSS, NOTO_LINK, NOTO_STACK, PRECONNECT } from "../shared-css";
import type { RenderedTemplate } from "../templates";

/** "Quote": a white card on the navy fill, the design's default question image. */
export function renderDefaultCard(
  escapedMessage: string,
  footerText: string,
  message: string
): RenderedTemplate {
  const { width, height, fontSize } = themeLayout("default", message);

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
      background: #10224A;
      padding: 16px;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      justify-content: space-between;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      color: rgba(255, 255, 255, 0.78);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      line-height: 1.4;
    }
    .mark { flex-shrink: 0; }
    .bubble {
      background: #ffffff;
      border-radius: 12px;
      padding: 12px 18px;
    }
    .message {
      color: #111C36;
      font-size: ${fontSize}px;
      font-weight: 600;
      line-height: 1.45;
      text-align: center;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
      width: 100%;
    }
    .footer {
      color: rgba(255, 255, 255, 0.62);
      font-size: 11px;
      font-weight: 400;
      text-align: center;
      flex-shrink: 0;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <p class="header">${markTile(16, "#FFFFFF", "#10224A")}<span>anonymous question</span></p>
  <div class="bubble">
    <p class="message">${escapedMessage}</p>
  </div>
  <p class="footer">${footerText}</p>
</body>
</html>`;
  return { html, width, height, fontSize };
}
