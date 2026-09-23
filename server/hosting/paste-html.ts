import { escapeHtml } from "./chrome";
import { MAX_UPLOAD_BYTES } from "./limits";
import { extractHtmlTitle } from "./zip";

const TITLE_MAX = 200;
const FALLBACK_TITLE = "貼り付け HTML";

// チャット由来の HTML は <div> だけの断片が多い。
// charset と viewport が無いとスマホで崩れ、書庫バー（body への注入）も安定しない。
// doctype / html / head / body が無いときだけ、最小の HTML 文書で包む。
const DOCUMENT_MARK = /<!doctype\s+html\b|<\s*html\b|<\s*head\b|<\s*body\b/i;

export type PreparedPaste =
  { ok: true; bytes: Uint8Array; title: string } | { ok: false; error: string };

export function isFullHtmlDocument(html: string): boolean {
  return DOCUMENT_MARK.test(html);
}

export function normalizeTitleOverride(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, TITLE_MAX);
}

function wrapFragment(body: string, title: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body>
${body}
</body>
</html>
`;
}

export function preparePastedHtml(html: string, titleOverride: string | null): PreparedPaste {
  if (html.trim().length === 0) {
    return { ok: false, error: "HTML が空です" };
  }

  // タイトル指定は書庫の表示名。完全な HTML の <title> はページ側のまま残す。
  const override = normalizeTitleOverride(titleOverride);
  const fromDocument = extractHtmlTitle(html, "");
  const title = override ?? (fromDocument.length > 0 ? fromDocument : FALLBACK_TITLE);
  const document = isFullHtmlDocument(html) ? html : wrapFragment(html, title);
  const bytes = new TextEncoder().encode(document);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "HTML の上限は 10MB です" };
  }
  return { ok: true, bytes, title };
}
