(() => {
  const chrome = document.getElementById("hh-lib-chrome");
  const host = document.getElementById("hh-lib-annot-root");
  if (!chrome || !host) return;

  const slug = chrome.getAttribute("data-slug") ?? "";
  const pagePath = chrome.getAttribute("data-page-path") ?? "index.html";
  if (!slug) return;

  const notesBtn = document.getElementById("hh-lib-notes");
  const shadow = host.attachShadow({ mode: "open" });
  host.hidden = false;

  const ui = document.createElement("div");
  ui.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      button, textarea, input { font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif; }
      .bar, .sheet, .pin {
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
        color: #1c1917;
      }
      .bar {
        display: none;
        position: absolute;
        left: 8px;
        right: 8px;
        bottom: calc(8px + env(safe-area-inset-bottom, 0px));
        gap: 8px;
        padding: 8px;
        background: #fffdf8;
        border: 1px solid #e7e0d4;
        border-radius: 16px;
        box-shadow: 0 8px 28px rgba(28,25,23,.16);
      }
      .bar.open { display: flex; }
      .bar button, .sheet .row button, .sheet .danger {
        min-height: 44px;
        border: 0;
        border-radius: 12px;
        padding: 0 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .bar .memo { flex: 1; background: #0f766e; color: #fff; }
      .bar .research { flex: 1; background: #f6f1e8; color: #1c1917; }
      .bar .close { background: transparent; color: #57534e; min-width: 44px; }
      .sheet {
        display: none;
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        max-height: min(88%, 640px);
        overflow: auto;
        background: #fffdf8;
        border-radius: 18px 18px 0 0;
        box-shadow: 0 -8px 32px rgba(28,25,23,.18);
        padding: 12px 14px calc(14px + env(safe-area-inset-bottom, 0px));
      }
      .sheet.open { display: block; }
      .sheet h2 { margin: 4px 0 8px; font-size: 16px; }
      .quote {
        margin: 0 0 10px;
        padding: 8px 10px;
        background: #f6f1e8;
        border-radius: 10px;
        font-size: 13px;
        max-height: 5.6em;
        overflow: auto;
        white-space: pre-wrap;
      }
      textarea {
        width: 100%;
        min-height: 120px;
        border: 1px solid #e7e0d4;
        border-radius: 12px;
        padding: 10px;
        resize: vertical;
        background: #fff;
      }
      .row { display: flex; gap: 8px; margin-top: 10px; }
      .row .save { flex: 1; background: #0f766e; color: #fff; }
      .row .cancel { background: #f6f1e8; }
      .muted { color: #57534e; font-size: 13px; margin: 0 0 8px; }
      .status { min-height: 1.4em; font-size: 13px; margin: 8px 0 0; }
      .status.err { color: #b91c1c; }
      .list { list-style: none; margin: 0; padding: 0; }
      .list li {
        display: block;
        width: 100%;
        text-align: left;
        padding: 10px 8px;
        border-bottom: 1px solid #e7e0d4;
        background: transparent;
        border-left: 0;
        border-right: 0;
        border-top: 0;
        border-radius: 0;
        cursor: pointer;
      }
      .list .kind { font-size: 11px; font-weight: 700; color: #0f766e; }
      .list .kind.research { color: #b45309; }
      .list .snip { display: block; font-size: 13px; }
      .pin {
        position: absolute;
        width: 22px;
        height: 22px;
        margin: -11px 0 0 -11px;
        border: 2px solid #fff;
        border-radius: 50%;
        background: #0f766e;
        box-shadow: 0 2px 8px rgba(28,25,23,.25);
        padding: 0;
      }
      .pin.research { background: #d97706; }
      .pins { position: absolute; inset: 0; pointer-events: none; }
      .pins .pin { pointer-events: auto; }
    </style>
    <div class="bar" id="bar">
      <button type="button" class="memo" id="bar-memo">メモ</button>
      <button type="button" class="research" id="bar-research">追記リサーチ</button>
      <button type="button" class="close" id="bar-close" aria-label="閉じる">×</button>
    </div>
    <div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"></div>
    <div class="pins" id="pins"></div>
  `;
  shadow.append(ui);

  const bar = shadow.getElementById("bar");
  const sheet = shadow.getElementById("sheet");
  const pins = shadow.getElementById("pins");
  const barMemo = shadow.getElementById("bar-memo");
  const barResearch = shadow.getElementById("bar-research");
  const barClose = shadow.getElementById("bar-close");

  /** @type {Array<any>} */
  let items = [];
  /** @type {{ exact: string, prefix: string, suffix: string } | null} */
  let savedQuote = null;
  let unauthorized = false;

  const highlightStyle = document.createElement("style");
  highlightStyle.id = "hh-lib-highlight-style";
  highlightStyle.textContent =
    "::highlight(hh-lib-memo){background-color:rgba(15,118,110,.28);color:inherit;}" +
    "::highlight(hh-lib-research){background-color:rgba(217,119,6,.28);color:inherit;}";
  document.documentElement.append(highlightStyle);

  function isOurNode(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return Boolean(
      el && el.closest && el.closest("#hh-lib-chrome, #hh-lib-annot-root, #hh-lib-style"),
    );
  }

  function captureQuote(selection) {
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (isOurNode(range.commonAncestorContainer)) return null;
    const exact = selection.toString().replace(/\s+/g, " ").trim();
    if (exact.length < 1) return null;
    const preRange = range.cloneRange();
    preRange.collapse(true);
    try {
      preRange.setStart(document.body, 0);
    } catch {
      return { exact: exact.slice(0, 2000), prefix: "", suffix: "" };
    }
    const prefix = preRange.toString().slice(-80).replace(/\s+/g, " ");
    const postRange = range.cloneRange();
    postRange.collapse(false);
    try {
      postRange.setEnd(document.body, document.body.childNodes.length);
    } catch {
      return { exact: exact.slice(0, 2000), prefix, suffix: "" };
    }
    const suffix = postRange.toString().slice(0, 80).replace(/\s+/g, " ");
    return { exact: exact.slice(0, 2000), prefix, suffix };
  }

  function collectTextNodes() {
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        if (isOurNode(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function rangeForQuote(quote) {
    const nodes = collectTextNodes();
    const parts = nodes.map((node) => node.nodeValue ?? "");
    const combined = parts.join("");
    const exact = quote.exact;
    if (!exact) return null;
    const prefixed = `${quote.prefix ?? ""}${exact}${quote.suffix ?? ""}`;
    let start = combined.indexOf(prefixed);
    let exactStart;
    if (start >= 0) {
      exactStart = start + (quote.prefix ?? "").length;
    } else {
      exactStart = combined.indexOf(exact);
      if (exactStart < 0) return null;
    }
    const exactEnd = exactStart + exact.length;
    let seen = 0;
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;
    for (const node of nodes) {
      const len = (node.nodeValue ?? "").length;
      if (!startNode && seen + len >= exactStart) {
        startNode = node;
        startOffset = exactStart - seen;
      }
      if (seen + len >= exactEnd) {
        endNode = node;
        endOffset = exactEnd - seen;
        break;
      }
      seen += len;
    }
    if (!startNode || !endNode) return null;
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  function syncViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    host.style.top = `${vv.offsetTop}px`;
    host.style.left = `${vv.offsetLeft}px`;
    host.style.width = `${vv.width}px`;
    host.style.height = `${vv.height}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
  }

  function setBarOpen(open) {
    bar.classList.toggle("open", open);
  }

  function closeSheet() {
    sheet.classList.remove("open");
    sheet.innerHTML = "";
  }

  function escapeText(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function renderSheet(mode, item) {
    const quote = item?.quote ?? savedQuote;
    const title = mode === "list" ? "メモ一覧" : mode === "research" ? "追記リサーチ" : "メモ";
    const quoteHtml = quote ? `<p class="quote">${escapeText(quote.exact)}</p>` : "";
    if (mode === "list") {
      const rows = items
        .map((entry) => {
          const kindLabel = entry.kind === "research" ? "追記リサーチ" : "メモ";
          const snip = (entry.body || entry.quote.exact).replace(/\s+/g, " ").slice(0, 80);
          return `<li data-id="${escapeText(entry.id)}"><span class="kind ${escapeText(entry.kind)}">${kindLabel}</span><span class="snip">${escapeText(snip)}</span></li>`;
        })
        .join("");
      sheet.innerHTML = `
        <h2 id="sheet-title">${title}</h2>
        <p class="muted">${unauthorized ? "メモの読み書きにはログインが必要です。" : items.length ? "タップすると該当箇所へ移動します。" : "本文を選択して、メモや追記リサーチを残せます。"}</p>
        <ul class="list">${rows}</ul>
        <div class="row"><button type="button" class="cancel" id="sheet-close">閉じる</button></div>
      `;
    } else if (mode === "research" && item) {
      sheet.innerHTML = `
        <h2 id="sheet-title">${title}</h2>
        ${quoteHtml}
        ${item.prompt ? `<p class="muted">質問: ${escapeText(item.prompt)}</p>` : ""}
        <p class="quote">${escapeText(item.body)}</p>
        <div class="row">
          <button type="button" class="cancel" id="sheet-close">閉じる</button>
          <button type="button" class="danger" id="sheet-delete">削除</button>
        </div>
      `;
    } else if (mode === "research") {
      sheet.innerHTML = `
        <h2 id="sheet-title">${title}</h2>
        ${quoteHtml}
        <p class="muted">選択箇所とページの文脈から、Workers AI が日本語で整理します。ライブ検索はしません。</p>
        <textarea id="sheet-prompt" placeholder="追加で聞きたいこと（任意）" maxlength="1000"></textarea>
        <p class="status" id="sheet-status"></p>
        <div class="row">
          <button type="button" class="save" id="sheet-run">リサーチする</button>
          <button type="button" class="cancel" id="sheet-close">キャンセル</button>
        </div>
      `;
    } else {
      sheet.innerHTML = `
        <h2 id="sheet-title">${title}</h2>
        ${quoteHtml}
        <textarea id="sheet-body" placeholder="この箇所についてのメモ" maxlength="8000">${item ? escapeText(item.body) : ""}</textarea>
        <p class="status" id="sheet-status"></p>
        <div class="row">
          <button type="button" class="save" id="sheet-save">保存する</button>
          <button type="button" class="cancel" id="sheet-close">キャンセル</button>
          ${item ? `<button type="button" class="danger" id="sheet-delete">削除</button>` : ""}
        </div>
      `;
    }
    sheet.classList.add("open");
    setBarOpen(false);
    sheet.querySelector("#sheet-close")?.addEventListener("click", closeSheet);
    sheet.querySelector("#sheet-save")?.addEventListener("click", () => saveMemo(item));
    sheet.querySelector("#sheet-run")?.addEventListener("click", runResearch);
    sheet.querySelector("#sheet-delete")?.addEventListener("click", () => deleteItem(item));
    sheet.querySelectorAll(".list li").forEach((row) => {
      row.addEventListener("click", () => {
        const found = items.find((entry) => entry.id === row.getAttribute("data-id"));
        if (found) openItem(found);
      });
    });
    const focusEl = sheet.querySelector("textarea");
    if (focusEl) {
      window.setTimeout(() => focusEl.focus(), 50);
    }
  }

  async function api(path, options) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { accept: "application/json", ...(options?.headers ?? {}) },
      ...options,
    });
    return res;
  }

  async function loadItems() {
    const res = await api(
      `/api/hosts/${encodeURIComponent(slug)}/annotations?path=${encodeURIComponent(pagePath)}`,
    );
    if (res.status === 401) {
      unauthorized = true;
      items = [];
      paintHighlights();
      return;
    }
    if (!res.ok) return;
    const body = await res.json();
    items = body.items ?? [];
    paintHighlights();
  }

  function paintHighlights() {
    pins.replaceChildren();
    if (CSS.highlights) {
      CSS.highlights.delete("hh-lib-memo");
      CSS.highlights.delete("hh-lib-research");
    }
    const memoRanges = [];
    const researchRanges = [];
    for (const item of items) {
      const range = rangeForQuote(item.quote);
      if (!range) continue;
      if (item.kind === "research") researchRanges.push(range);
      else memoRanges.push(range);
      const rects = range.getClientRects();
      const rect = rects[0];
      if (!rect) continue;
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = item.kind === "research" ? "pin research" : "pin";
      pin.setAttribute("aria-label", item.kind === "research" ? "追記リサーチ" : "メモ");
      const hostBox = host.getBoundingClientRect();
      pin.style.left = `${rect.left - hostBox.left}px`;
      pin.style.top = `${rect.top - hostBox.top}px`;
      pin.addEventListener("click", () => openItem(item));
      pins.append(pin);
    }
    if (CSS.highlights) {
      if (memoRanges.length) CSS.highlights.set("hh-lib-memo", new Highlight(...memoRanges));
      if (researchRanges.length)
        CSS.highlights.set("hh-lib-research", new Highlight(...researchRanges));
    }
  }

  function surroundingContext(quote) {
    const range = rangeForQuote(quote);
    if (!range) return "";
    const expanded = range.cloneRange();
    try {
      const node = range.startContainer;
      const block = node.nodeType === 1 ? node : node.parentElement;
      const target = block?.closest("p, li, h1, h2, h3, h4, article, section") ?? block;
      if (target) {
        return target.innerText.replace(/\s+/g, " ").trim().slice(0, 4000);
      }
    } catch {
      return quote.exact;
    }
    return quote.exact;
  }

  async function saveMemo(existing) {
    const textarea = sheet.querySelector("#sheet-body");
    const status = sheet.querySelector("#sheet-status");
    const body = (textarea?.value ?? "").trim();
    if (!body) {
      if (status) {
        status.textContent = "メモを入力してください";
        status.className = "status err";
      }
      return;
    }
    const quote = existing?.quote ?? savedQuote;
    if (!quote) return;
    if (status) {
      status.textContent = "保存しています…";
      status.className = "status";
    }
    const res = existing
      ? await api(
          `/api/hosts/${encodeURIComponent(slug)}/annotations/${encodeURIComponent(existing.id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body }),
          },
        )
      : await api(`/api/hosts/${encodeURIComponent(slug)}/annotations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pagePath, quote, body }),
        });
    if (res.status === 401) {
      if (status) {
        status.textContent = "ログインが必要です";
        status.className = "status err";
      }
      return;
    }
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      if (status) {
        status.textContent = payload.error ?? "保存に失敗しました";
        status.className = "status err";
      }
      return;
    }
    closeSheet();
    await loadItems();
  }

  async function runResearch() {
    const promptEl = sheet.querySelector("#sheet-prompt");
    const status = sheet.querySelector("#sheet-status");
    const runBtn = sheet.querySelector("#sheet-run");
    if (!savedQuote) return;
    if (status) {
      status.textContent = "リサーチしています…";
      status.className = "status";
    }
    if (runBtn) runBtn.disabled = true;
    const res = await api(`/api/hosts/${encodeURIComponent(slug)}/annotations/research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pagePath,
        quote: savedQuote,
        prompt: promptEl?.value?.trim() ?? "",
        pageTitle: document.title,
        context: surroundingContext(savedQuote),
      }),
    });
    if (runBtn) runBtn.disabled = false;
    if (res.status === 401) {
      if (status) {
        status.textContent = "ログインが必要です";
        status.className = "status err";
      }
      return;
    }
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      if (status) {
        status.textContent = payload.error ?? "追記リサーチに失敗しました";
        status.className = "status err";
      }
      return;
    }
    const payload = await res.json();
    await loadItems();
    if (payload.item) openItem(payload.item);
  }

  async function deleteItem(item) {
    if (!item) return;
    if (!window.confirm("このメモを削除しますか？")) return;
    const res = await api(
      `/api/hosts/${encodeURIComponent(slug)}/annotations/${encodeURIComponent(item.id)}`,
      {
        method: "DELETE",
      },
    );
    if (res.status !== 204) return;
    closeSheet();
    await loadItems();
  }

  function openItem(item) {
    const range = rangeForQuote(item.quote);
    if (range) {
      const node =
        range.startContainer.nodeType === 1
          ? range.startContainer
          : range.startContainer.parentElement;
      node?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    renderSheet(item.kind === "research" ? "research" : "memo", item);
  }

  function onSelectionMaybe() {
    const selection = document.getSelection();
    const quote = captureQuote(selection);
    if (!quote) return;
    savedQuote = quote;
    setBarOpen(true);
  }

  document.addEventListener("selectionchange", () => {
    window.setTimeout(onSelectionMaybe, 280);
  });
  document.addEventListener("pointerup", () => {
    window.setTimeout(onSelectionMaybe, 0);
  });

  barClose.addEventListener("click", () => setBarOpen(false));
  barMemo.addEventListener("click", () => {
    if (!savedQuote) return;
    renderSheet("memo");
  });
  barResearch.addEventListener("click", () => {
    if (!savedQuote) return;
    renderSheet("research");
  });
  notesBtn?.addEventListener("click", () => renderSheet("list"));

  window.addEventListener("scroll", paintHighlights, { passive: true });
  window.addEventListener("resize", paintHighlights);
  window.visualViewport?.addEventListener("resize", () => {
    syncViewport();
    paintHighlights();
  });
  window.visualViewport?.addEventListener("scroll", () => {
    syncViewport();
    paintHighlights();
  });
  syncViewport();
  loadItems();
})();
