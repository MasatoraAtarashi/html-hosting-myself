const form = document.getElementById("upload-form");
const pasteForm = document.getElementById("paste-form");
const fileInput = document.getElementById("file-input");
const dropzone = document.getElementById("dropzone");
const fileName = document.getElementById("file-name");
const pasteHtml = document.getElementById("paste-html");
const pasteTitle = document.getElementById("paste-title");
const message = document.getElementById("form-message");
const uploadErrors = document.getElementById("upload-errors");
const shareBox = document.getElementById("share-box");
const shareLabel = document.getElementById("share-label");
const shareUrl = document.getElementById("share-url");
const shareExtra = document.getElementById("share-extra");
const copyLink = document.getElementById("copy-link");
const hostList = document.getElementById("host-list");
const listEmpty = document.getElementById("list-empty");
const listNone = document.getElementById("list-none");
const listCount = document.getElementById("list-count");
const hostSearch = document.getElementById("host-search");
const submitButton = form.querySelector('button[type="submit"]');
const pasteSubmit = pasteForm.querySelector('button[type="submit"]');

const MAX_BATCH_UPLOADS = 20;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** @type {Array<{slug: string, title: string, url: string, createdAt: number, expiresAt: number | null, sizeBytes: number, fileCount: number}>} */
let hostsCache = [];

function setMessage(text, kind) {
  message.textContent = text;
  message.className = kind ? `form-message ${kind}` : "form-message";
}

function setBusy(busy) {
  if (submitButton) submitButton.disabled = busy;
  if (pasteSubmit) pasteSubmit.disabled = busy;
}

function revealStatus() {
  const target = shareBox.hidden ? message : shareBox;
  target.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setUploadErrors(errors) {
  uploadErrors.replaceChildren();
  uploadErrors.hidden = errors.length === 0;
  for (const entry of errors) {
    const li = document.createElement("li");
    li.textContent = `${entry.name}: ${entry.error}`;
    uploadErrors.append(li);
  }
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

function selectedFiles() {
  return Array.from(fileInput.files ?? []);
}

function describeFiles(files) {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0].name;
  const names = files
    .slice(0, 3)
    .map((file) => file.name)
    .join("、");
  const extra = files.length > 3 ? ` ほか${files.length - 3}件` : "";
  return `${files.length}件: ${names}${extra}`;
}

function assignFiles(list) {
  const transfer = new DataTransfer();
  for (const file of list) transfer.items.add(file);
  fileInput.files = transfer.files;
  fileName.textContent = describeFiles(selectedFiles());
}

function showShare(items) {
  shareExtra.replaceChildren();
  if (items.length === 0) {
    shareBox.hidden = true;
    return;
  }
  const urls = items.map((item) => absoluteShareUrl(item.url));
  shareUrl.value = urls[0];
  shareLabel.textContent = items.length === 1 ? "閲覧 URL" : "閲覧 URL（1件目）";
  shareBox.hidden = false;
  if (items.length > 1) {
    shareExtra.hidden = false;
    for (const url of urls.slice(1)) {
      const li = document.createElement("li");
      li.textContent = url;
      shareExtra.append(li);
    }
  } else {
    shareExtra.hidden = true;
  }
}

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0) return;
  assignFiles(files.slice(0, MAX_BATCH_UPLOADS));
});

fileInput.addEventListener("change", () => {
  fileName.textContent = describeFiles(selectedFiles());
});

hostSearch.addEventListener("input", () => {
  renderHosts();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const files = selectedFiles();
  if (files.length === 0) {
    setMessage("ファイルを選択してください", "error");
    return;
  }
  if (files.length > MAX_BATCH_UPLOADS) {
    setMessage(`一度に置けるのは ${MAX_BATCH_UPLOADS} 件までです`, "error");
    return;
  }

  shareBox.hidden = true;
  shareExtra.hidden = true;
  setUploadErrors([]);
  setBusy(true);

  const ttl = document.getElementById("ttl").value;
  const items = [];
  const errors = [];

  try {
    for (let i = 0; i < files.length; i++) {
      setMessage(`${i + 1} / ${files.length} 件を置いています…`);
      const data = new FormData();
      data.set("file", files[i]);
      data.set("ttl", ttl);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: data });
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setMessage(
            "書き込み API は API_TOKEN で保護されています。Authorization: Bearer を付けるか、secret 未設定の preview を使ってください。",
            "error",
          );
          setUploadErrors(errors);
          showShare(items);
          revealStatus();
          if (items.length > 0) await loadHosts();
          return;
        }
        if (!res.ok) {
          errors.push({
            name: files[i].name,
            error: body.error ?? "アップロードに失敗しました",
          });
          continue;
        }
        items.push(body.item);
      } catch {
        errors.push({ name: files[i].name, error: "通信に失敗しました" });
      }
    }

    setUploadErrors(errors);
    showShare(items);
    if (items.length > 0 && errors.length === 0) {
      setMessage(
        items.length === 1
          ? "書庫に置きました。あとから見返す用の URL をコピーできます。"
          : `${items.length}件を書庫に置きました。それぞれ一覧から開けます。`,
        "success",
      );
    } else if (items.length > 0) {
      setMessage(`${items.length}件成功、${errors.length}件失敗`, "error");
    } else {
      setMessage(
        errors.length ? "どのファイルも置けませんでした" : "アップロードに失敗しました",
        "error",
      );
    }

    form.reset();
    fileName.textContent = "";
    document.getElementById("ttl").value = "keep";
    hostSearch.value = "";
    revealStatus();
    await loadHosts();
  } finally {
    setBusy(false);
  }
});

pasteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const html = pasteHtml.value ?? "";
  if (html.trim().length === 0) {
    setMessage("HTML を貼り付けてください", "error");
    pasteHtml.focus();
    return;
  }
  if (new Blob([html]).size > MAX_UPLOAD_BYTES) {
    setMessage("HTML の上限は 10MB です", "error");
    return;
  }

  shareBox.hidden = true;
  shareExtra.hidden = true;
  setUploadErrors([]);
  setBusy(true);
  setMessage("書庫に保存しています…");

  const data = new FormData();
  data.set("html", html);
  data.set("title", pasteTitle.value ?? "");
  data.set("ttl", document.getElementById("paste-ttl").value || "keep");

  try {
    const res = await fetch("/api/upload", { method: "POST", body: data });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setMessage(
        "書き込み API は API_TOKEN で保護されています。Authorization: Bearer を付けるか、secret 未設定の preview を使ってください。",
        "error",
      );
      revealStatus();
      return;
    }
    if (!res.ok || !body.item) {
      setMessage(body.error ?? "保存に失敗しました", "error");
      revealStatus();
      return;
    }

    showShare([body.item]);
    setMessage("書庫に保存しました。あとから見返す用の URL をコピーできます。", "success");
    revealStatus();
    pasteForm.reset();
    document.getElementById("paste-ttl").value = "keep";
    hostSearch.value = "";
    await loadHosts();
  } catch {
    setMessage("通信に失敗しました", "error");
  } finally {
    setBusy(false);
  }
});

copyLink.addEventListener("click", async () => {
  const extras = Array.from(shareExtra.querySelectorAll("li")).map((li) => li.textContent ?? "");
  const value = [shareUrl.value, ...extras].filter(Boolean).join("\n");
  const ok = await copyText(value);
  setMessage(
    ok ? "リンクをコピーしました" : "URL を選択したので手動でコピーしてください",
    ok ? "success" : "",
  );
});

loadHosts();
