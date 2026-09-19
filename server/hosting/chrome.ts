export interface ArchiveNavItem {
  slug: string;
  title: string;
}

export interface ArchiveChromeInput {
  currentSlug: string;
  currentTitle: string;
  currentPagePath: string;
  hosts: ArchiveNavItem[];
}

const ARCHIVE_NAV_LIMIT = 100;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const mime = contentType.split(";")[0]?.trim().toLowerCase();
  return mime === "text/html" || mime === "application/xhtml+xml";
}

export async function loadArchiveNav(db: D1Database): Promise<ArchiveNavItem[]> {
  const now = Date.now();
  const result = await db
    .prepare(
      `SELECT slug, title FROM hosts
       WHERE expires_at IS NULL OR expires_at > ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(now, ARCHIVE_NAV_LIMIT)
    .all<ArchiveNavItem>();
  return result.results ?? [];
}

function chromeStyles(): string {
  // ホステッドページの CSS に負けないよう、バー専用 ID に !important を付ける。
  // iframe シェルは相対パスや viewport を壊しやすいので、HTML への注入にしている。
  return `<style id="hh-lib-style">
#hh-lib-chrome{
  display:flex !important;
  align-items:center !important;
  gap:6px !important;
  position:sticky !important;
  top:0 !important;
  z-index:2147483647 !important;
  width:100% !important;
  max-width:100vw !important;
  min-height:48px !important;
  margin:0 !important;
  padding:6px 8px !important;
  padding-top:max(6px, env(safe-area-inset-top, 0px)) !important;
  box-sizing:border-box !important;
  background:#fffdf8 !important;
  color:#1c1917 !important;
  border:0 !important;
  border-bottom:1px solid #e7e0d4 !important;
  font:600 13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Noto Sans JP",Meiryo,sans-serif !important;
  flex:0 0 auto !important;
  align-self:stretch !important;
  grid-column:1 / -1 !important;
  visibility:visible !important;
  opacity:1 !important;
  transform:none !important;
  pointer-events:auto !important;
  letter-spacing:normal !important;
  text-transform:none !important;
}
#hh-lib-chrome *{box-sizing:border-box !important;}
#hh-lib-chrome a{
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  min-height:44px !important;
  min-width:44px !important;
  padding:0 10px !important;
  border-radius:10px !important;
  text-decoration:none !important;
  color:#0f766e !important;
  background:#ecfdf8 !important;
  white-space:nowrap !important;
  font:inherit !important;
  pointer-events:auto !important;
}
#hh-lib-chrome a#hh-lib-home{font-weight:700 !important;background:#0f766e !important;color:#fff !important;}
#hh-lib-chrome .hh-lib-title{
  flex:1 1 auto !important;
  min-width:0 !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
  white-space:nowrap !important;
  color:#1c1917 !important;
  font-weight:700 !important;
  text-decoration:none !important;
  background:transparent !important;
  justify-content:flex-start !important;
  min-width:0 !important;
  padding:0 4px !important;
}
#hh-lib-chrome .hh-lib-disabled{
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  min-height:44px !important;
  min-width:44px !important;
  padding:0 10px !important;
  color:#a8a29e !important;
  background:#f5f5f4 !important;
  border-radius:10px !important;
}
#hh-lib-chrome details{position:relative !important;flex:0 0 auto !important;}
#hh-lib-chrome summary{
  list-style:none !important;
  cursor:pointer !important;
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  min-height:44px !important;
  padding:0 10px !important;
  border-radius:10px !important;
  background:#f6f1e8 !important;
  color:#1c1917 !important;
  font:inherit !important;
}
#hh-lib-chrome summary::-webkit-details-marker{display:none;}
#hh-lib-chrome .hh-lib-menu{
  position:absolute !important;
  right:0 !important;
  top:calc(100% + 4px) !important;
  width:min(82vw, 320px) !important;
  max-height:60vh !important;
  overflow:auto !important;
  background:#fff !important;
  border:1px solid #e7e0d4 !important;
  border-radius:12px !important;
  box-shadow:0 8px 24px rgba(28,25,23,.12) !important;
  padding:6px !important;
  z-index:2147483647 !important;
}
#hh-lib-chrome .hh-lib-menu a{
  display:block !important;
  width:100% !important;
  min-height:40px !important;
  justify-content:flex-start !important;
  background:transparent !important;
  color:#1c1917 !important;
  font-weight:500 !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
}
#hh-lib-chrome .hh-lib-menu a[aria-current="page"]{background:#ecfdf8 !important;color:#0f766e !important;font-weight:700 !important;}
#hh-lib-chrome button#hh-lib-notes{
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  min-height:44px !important;
  min-width:44px !important;
  padding:0 10px !important;
  border:0 !important;
  border-radius:10px !important;
  background:#f6f1e8 !important;
  color:#1c1917 !important;
  font:inherit !important;
  cursor:pointer !important;
  appearance:none !important;
  -webkit-appearance:none !important;
  box-shadow:none !important;
  margin:0 !important;
}
#hh-lib-annot-root{
  all:initial !important;
  position:fixed !important;
  inset:0 !important;
  width:auto !important;
  height:auto !important;
  pointer-events:none !important;
  z-index:2147483646 !important;
  contain:layout style !important;
}
@media (max-width:420px){
  #hh-lib-chrome{flex-wrap:wrap !important;}
  #hh-lib-chrome .hh-lib-title{
    order:10 !important;
    flex:1 0 100% !important;
    width:100% !important;
    min-height:28px !important;
    min-width:0 !important;
    padding:0 4px 4px !important;
  }
}
</style>`;
}

function navLink(href: string, label: string, id?: string): string {
  const idAttr = id ? ` id="${id}"` : "";
  return `<a${idAttr} href="${href}">${escapeHtml(label)}</a>`;
}

export function buildArchiveChrome(input: ArchiveChromeInput): string {
  const index = input.hosts.findIndex((item) => item.slug === input.currentSlug);
  const newer = index > 0 ? input.hosts[index - 1] : undefined;
  const older = index >= 0 && index < input.hosts.length - 1 ? input.hosts[index + 1] : undefined;
  const home = navLink("/", "一覧へ", "hh-lib-home");
  const prev = newer
    ? navLink(`/p/${newer.slug}/`, "前へ")
    : `<span class="hh-lib-disabled" aria-disabled="true">前へ</span>`;
  const next = older
    ? navLink(`/p/${older.slug}/`, "次へ")
    : `<span class="hh-lib-disabled" aria-disabled="true">次へ</span>`;
  const titleHref = `/p/${input.currentSlug}/`;
  const title = escapeHtml(input.currentTitle);
  const slug = escapeHtml(input.currentSlug);
  const pagePath = escapeHtml(input.currentPagePath);
  const menuItems = input.hosts
    .map((item) => {
      const current = item.slug === input.currentSlug ? ` aria-current="page"` : "";
      return `<a href="/p/${item.slug}/"${current}>${escapeHtml(item.title)}</a>`;
    })
    .join("");
  const jump =
    input.hosts.length > 1
      ? `<details><summary>ジャンプ</summary><div class="hh-lib-menu">${menuItems}</div></details>`
      : "";

  return `${chromeStyles()}<div id="hh-lib-chrome" role="navigation" aria-label="書庫ナビ" data-slug="${slug}" data-page-path="${pagePath}">
${home}
<a class="hh-lib-title" href="${titleHref}" title="${title}">${title}</a>
${prev}${next}
<button type="button" id="hh-lib-notes">メモ</button>
${jump}
</div>
<div id="hh-lib-annot-root" hidden></div>`;
}

export function applyArchiveChrome(response: Response, input: ArchiveChromeInput): Response {
  const html = buildArchiveChrome(input);
  return new HTMLRewriter()
    .on("body", {
      element(element) {
        element.prepend(html, { html: true });
        element.append(`<script src="/hh-lib-annotate.js" defer></script>`, { html: true });
      },
    })
    .transform(response);
}
