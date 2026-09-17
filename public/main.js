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

function setMessage(text, kind) {
  message.textContent = text;
  message.className = kind ? `form-message ${kind}` : "form-message";
}

function formatExpiry(expiresAt) {
  if (expiresAt === null) return "期限なし";
  const date = new Date(expiresAt);
  return `期限 ${date.toLocaleString("ja-JP")}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const items = body.items ?? [];
  hostList.replaceChildren();
  listEmpty.hidden = items.length > 0;

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "host-item";

    const meta = document.createElement("div");
    meta.className = "host-meta";
    const link = document.createElement("a");
    link.href = item.url;
    link.textContent = item.title;
    const detail = document.createElement("p");
    detail.className = "muted";
    detail.textContent = `${item.slug} · ${formatSize(item.sizeBytes)} · ${formatExpiry(item.expiresAt)}`;
    meta.append(link, detail);

    const actions = document.createElement("div");
    actions.className = "host-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "button button-ghost";
    copyBtn.textContent = "リンクをコピー";
    copyBtn.addEventListener("click", async () => {
      const ok = await copyText(absoluteShareUrl(item.url));
      setMessage(
        ok ? "リンクをコピーしました" : "URL を選択したので手動でコピーしてください",
        ok ? "success" : "",
      );
    });

    const keepBtn = document.createElement("button");
    keepBtn.type = "button";
    keepBtn.className = "button button-ghost";
    keepBtn.textContent = "期限なしにする";
    keepBtn.disabled = item.expiresAt === null;
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

    actions.append(copyBtn, keepBtn, deleteBtn);
    li.append(meta, actions);
    hostList.append(li);
  }
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
    setMessage("ホストしました。共有 URL をコピーできます。", "success");
    form.reset();
    fileName.textContent = "";
    document.getElementById("ttl").value = "7d";
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
