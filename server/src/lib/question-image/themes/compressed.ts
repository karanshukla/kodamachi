import { themeLayout } from "../layout";
import { BASE_CSS, NOTO_LINK, NOTO_STACK, PRECONNECT } from "../shared-css";
import type { RenderedTemplate } from "../templates";

/** "Compact": a white-ruled block on midnight, for feeds read in the dark. */
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
      background: #0B1428;
      padding: 12px;
      display: flex;
      align-items: stretch;
    }
    .card {
      background: #101E3C;
      border-radius: 10px;
      border-left: 4px solid #FFFFFF;
      padding: 12px 14px 12px 13px;
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .label {
      font-size: 9px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.72);
      text-transform: uppercase;
      letter-spacing: 0.14em;
      margin-bottom: 6px;
    }
    .message {
      color: #F4F7FC;
      font-size: ${fontSize}px;
      font-weight: 600;
      line-height: 1.45;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }
    .footer {
      font-size: 10px;
      color: #8798B8;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div>
      <div class="label">Anonymous question</div>
      <div class="message">${escapedMessage}</div>
    </div>
    <div class="footer">${footerText}</div>
  </div>
</body>
</html>`;
  return { html, width, height, fontSize };
}
