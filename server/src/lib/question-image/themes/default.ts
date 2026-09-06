import { themeLayout } from "../layout";
import { BASE_CSS, NOTO_LINK, NOTO_STACK, PRECONNECT } from "../shared-css";
import type { RenderedTemplate } from "../templates";

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
      background: linear-gradient(135deg, #1E1B4B 0%, #3B2E78 50%, #6B3FD4 100%);
      padding: 16px;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      justify-content: space-between;
    }
    .header {
      color: rgba(255, 255, 255, 0.90);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 1px;
      text-align: center;
      text-transform: uppercase;
      line-height: 1.4;
    }
    .bubble {
      background: #ffffff;
      border-radius: 16px;
      padding: 12px 18px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.30);
    }
    .message {
      color: #111111;
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
  <p class="header">send me anonymous messages</p>
  <div class="bubble">
    <p class="message">${escapedMessage}</p>
  </div>
  <p class="footer">${footerText}</p>
</body>
</html>`;
  return { html, width, height, fontSize };
}
