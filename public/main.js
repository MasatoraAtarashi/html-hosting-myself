const form = document.getElementById("upload-form");
const fileInput = document.getElementById("file-input");
const dropzone = document.getElementById("dropzone");
const fileName = document.getElementById("file-name");
const message = document.getElementById("form-message");
const shareBox = document.getElementById("share-box");
const shareUrl = document.getElementById("share-url");
const copyLink = document.getElementById("copy-link");
const hostList = document.getElementById("host-list");
const listEmpty = document.getElementById("list-empty");
const listNone = document.getElementById("list-none");
const listCount = document.getElementById("list-count");
const hostSearch = document.getElementById("host-search");

/** @type {Array<{slug: string, title: string, url: string, createdAt: number, expiresAt: number | null, sizeBytes: number, fileCount: number}>} */
let hostsCache = [];

function setMessage(text, kind) {
  message.textContent = text;
  message.className = kind ? `form-message ${kind}` : "form-message";
}

function formatExpiry(expiresAt) {
  if (expiresAt === null) return "期限なし";
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "期限切れ";
  const days = Math.ceil(remaining / 86_400_000);
  if (days <= 1) return "期限 本日";
  if (days <= 30) return `あと${days}日`;
  return `期限 ${new Date(expiresAt).toLocaleDateString("ja-JP")}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCreatedAt(createdAt) {
  const date = new Date(createdAt);
  const absolute = date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const diff = Date.now() - createdAt;
  if (!Number.isFinite(diff) || diff < 0) {
    return { absolute, relative: absolute, iso: date.toISOString() };
  }
  const sec = Math.floor(diff / 1000);
  let relative = "たった今";
  if (sec >= 60 * 60 * 24 * 365) relative = `${Math.floor(sec / (60 * 60 * 24 * 365))}年前`;
  else if (sec >= 60 * 60 * 24 * 30) relative = `${Math.floor(sec / (60 * 60 * 24 * 30))}か月前`;
  else if (sec >= 60 * 60 * 24) relative = `${Math.floor(sec / (60 * 60 * 24))}日前`;
  else if (sec >= 60 * 60) relative = `${Math.floor(sec / (60 * 60))}時間前`;
  else if (sec >= 60) relative = `${Math.floor(sec / 60)}分前`;
  return { absolute, relative, iso: date.toISOString() };
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    shareUrl.focus();
    shareUrl.select();
    return false;
  }
}

function absoluteShareUrl(path) {
  return new URL(path, window.location.origin).href;
}

function queryMatches(item, query) {
  if (!query) return true;
  return item.title.toLowerCase().includes(query);
}

function renderHosts() {
  const query = (hostSearch.value ?? "").trim().toLowerCase();
  const items = hostsCache.filter((item) => queryMatches(item, query));
  hostList.replaceChildren();
  listEmpty.hidden = hostsCache.length > 0;
  listNone.hidden = !(hostsCache.length > 0 && items.length === 0);
  const searchLabel = hostSearch.closest(".search-label");
  if (searchLabel) searchLabel.hidden = hostsCache.length === 0;
  hostSearch.hidden = hostsCache.length === 0;
  if (hostsCache.length === 0) {
    listCount.textContent = "";
  } else if (query) {
    listCount.textContent = `${items.length} / ${hostsCache.length}件`;
  } else {
    listCount.textContent = `${hostsCache.length}件`;
  }

  for (const item of items) {
    const created = formatCreatedAt(item.createdAt);
    const li = document.createElement("li");
    li.className = "host-item";

    const main = document.createElement("a");
    main.className = "host-main";
    main.href = item.url;
    const title = document.createElement("span");
    title.className = "host-title";
    title.textContent = item.title;
    const meta = document.createElement("span");
    meta.className = "host-meta-line";
    const time = document.createElement("time");
    time.dateTime = created.iso;
    time.textContent = `${created.relative} · ${created.absolute}`;
    const size = document.createElement("span");
    size.textContent = formatSize(item.sizeBytes);
    const expiry = document.createElement("span");
    expiry.textContent = formatExpiry(item.expiresAt);
    meta.append(time, size, expiry);
    main.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "host-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "button button-ghost";
    copyBtn.textContent = "コピー";
    copyBtn.addEventListener("click", async () => {
      const ok = await copyText(absoluteShareUrl(item.url));
      setMessage(
        ok ? "リンクをコピーしました" : "URL を選択したので手動でコピーしてください",
        ok ? "success" : "",
      );
    });

    actions.append(copyBtn);

    if (item.expiresAt !== null) {
      const keepBtn = document.createElement("button");
      keepBtn.type = "button";
      keepBtn.className = "button button-ghost";
      keepBtn.textContent = "期限なし";
      keepBtn.addEventListener("click", async () => {
        const patch = await fetch(`/api/hosts/${item.slug}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ttl: "keep" }),
        });
        if (!patch.ok) {
          setMessage("更新に失敗しました", "error");
          return;
        }
        setMessage("期限なしにしました", "success");
        await loadHosts();
      });
      actions.append(keepBtn);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "button button-danger";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", async () => {
      if (!window.confirm(`${item.title} を削除しますか？`)) return;
      const del = await fetch(`/api/hosts/${item.slug}`, { method: "DELETE" });
      if (del.status !== 204) {
        setMessage("削除に失敗しました", "error");
        return;
      }
      setMessage("削除しました", "success");
      shareBox.hidden = true;
      await loadHosts();
    });

    actions.append(deleteBtn);
    li.append(main, actions);
    hostList.append(li);
  }
}

async function loadHosts() {
  const res = await fetch("/api/hosts");
  if (res.status === 401) {
    setMessage(
      "書き込み API は API_TOKEN で保護されています。curl で Bearer を付けるか、secret 未設定の preview を使ってください。",
      "error",
    );
    return;
  }
  if (!res.ok) {
    setMessage("一覧の取得に失敗しました", "error");
    return;
  }
  const body = await res.json();
  hostsCache = body.items ?? [];
  renderHosts();
}

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileName.textContent = file.name;
});

fileInput.addEventListener("change", () => {
  fileName.textContent = fileInput.files?.[0]?.name ?? "";
});

hostSearch.addEventListener("input", () => {
  renderHosts();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files?.[0];
  if (!file) {
    setMessage("ファイルを選択してください", "error");
    return;
  }

  setMessage("アップロード中...");
  shareBox.hidden = true;

  const data = new FormData();
  data.set("file", file);
  data.set("ttl", document.getElementById("ttl").value);

  try {
    const res = await fetch("/api/upload", { method: "POST", body: data });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setMessage(
        "書き込み API は API_TOKEN で保護されています。Authorization: Bearer を付けるか、secret 未設定の preview を使ってください。",
        "error",
      );
      return;
    }
    if (!res.ok) {
      setMessage(body.error ?? "アップロードに失敗しました", "error");
      return;
    }

    const url = absoluteShareUrl(body.item.url);
    shareUrl.value = url;
    shareBox.hidden = false;
    setMessage("書庫に置きました。あとから見返す用の URL をコピーできます。", "success");
    form.reset();
    fileName.textContent = "";
    document.getElementById("ttl").value = "keep";
    hostSearch.value = "";
    await loadHosts();
  } catch {
    setMessage("アップロードに失敗しました。通信環境を確認してください", "error");
  }
});

copyLink.addEventListener("click", async () => {
  const ok = await copyText(shareUrl.value);
  setMessage(
    ok ? "リンクをコピーしました" : "URL を選択したので手動でコピーしてください",
    ok ? "success" : "",
  );
});

loadHosts();
