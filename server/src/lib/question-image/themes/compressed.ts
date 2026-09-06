import { themeLayout } from "../layout";
import { BASE_CSS, NOTO_LINK, NOTO_STACK, PRECONNECT } from "../shared-css";
import type { RenderedTemplate } from "../templates";

export function renderCompressedCard(
  escapedMessage: string,
  footerText: string,
  message: string
): RenderedTemplate {
  const { width, height, fontSize } = themeLayout("compressed", message);

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
      background: #1a1a2a;
      padding: 12px;
      display: flex;
      align-items: stretch;
    }
    .card {
      background: #22223a;
      border-radius: 10px;
      border-left: 4px solid #7c3aed;
      padding: 12px 14px 12px 13px;
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .label {
      font-size: 9px;
      font-weight: 700;
      color: #a78bfa;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }
    .message {
      color: #f0f0ff;
      font-size: ${fontSize}px;
      font-weight: 600;
      line-height: 1.45;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }
    .footer {
      font-size: 10px;
      color: #6b7280;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div>
      <div class="label">Anonymous Question</div>
      <div class="message">${escapedMessage}</div>
    </div>
    <div class="footer">${footerText}</div>
  </div>
</body>
</html>`;
  return { html, width, height, fontSize };
}
