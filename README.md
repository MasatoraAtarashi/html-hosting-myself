# html-hosting-myself

自分用の薄い静的ホスティング。メモやリサーチ用の HTML、AI が作った静的サイトの ZIP を置いて、あとからスマホで見るための短い URL を発行します。BASE の [pon](https://devblog.thebase.in/entry/pon) や [ssss](https://ssss-app.com) の「置いて開く」体験を、Cloudflare Worker **`html-hosting-myself`** 上で動かします。

UI は保存したページを見返す書庫です。ダッシュボード先頭が一覧で、閲覧ページ（`/p/*` の HTML）には「一覧へ」と前後ジャンプのバーが付きます。

このリポジトリにトークンはコミットしません。GitHub Actions の secrets を自分で入れ、Deploy を動かしてください。

## デプロイ（最初にやること）

### 1. GitHub secrets を設定する

リポジトリ: [Settings → Secrets and variables → Actions](https://github.com/MasatoraAtarashi/html-hosting-myself/settings/secrets/actions) → **New repository secret**（または既存の値を更新）

| Name                    | 値                         |
| ----------------------- | -------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare の API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare の Account ID   |

新しい secret 名は増やしません。この 2 つだけです。

**`CLOUDFLARE_API_TOKEN` の作り方**

1. [Cloudflare Dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token**
2. 「Create Custom Token」で次の権限を付ける（Account リソース）
   - **Workers Scripts:Edit**
   - **D1:Edit**
   - **Workers R2 Storage:Edit**（画面上は R2 の Edit）
3. Account に自分のアカウントを指定して発行し、値を secret に貼る

**`CLOUDFLARE_ACCOUNT_ID` の確認**

Workers の概要ページ右サイドバー、またはダッシュボード URL の `dash.cloudflare.com/<ACCOUNT_ID>/...` です。トークンと同じアカウントの ID にしてください。別アカウントの D1（`research-host-db`）を指定すると Deploy が 7403 で落ちます。

### 2. Deploy を再実行する

secret を入れたあと:

1. `main` に push する（またはすでに `main` にある場合はそのまま）
2. GitHub Actions の **Deploy** ワークフローを開く
3. 直前の実行が secret 空で落ちていれば **Re-run jobs**
4. トークンが空なら migrate / deploy の前に失敗します（分かりやすいエラーメッセージ）

`main` への push では次の順で動きます。

1. typecheck / test（PR Checks）
2. D1 `html-hosting-myself-db` と R2 `html-hosting-myself` を、secrets のアカウントに無ければ作成する
3. `wrangler d1 migrations apply DB --remote`
4. `wrangler deploy`（Worker 名 **`html-hosting-myself`**）

### 3. workers.dev を開いて HTML を置く

デプロイ後の URL（アカウントの workers.dev サブドメイン）:

**https://html-hosting-myself.kaito-technology.workers.dev**

ダッシュボードに `.html` または `.zip` をドロップすると `/p/<slug>/` の閲覧 URL が発行されます。スマホの閲覧画面からは「一覧へ」で書庫に戻れます。

### 4. （任意）書き込みを閉じる

初回は `API_TOKEN` も Access も未設定なら、ダッシュボードからのアップロードが通るようにしています。閉じるとき:

```bash
pnpm exec wrangler secret put API_TOKEN
```

これは **Worker secret** です。GitHub の `CLOUDFLARE_API_TOKEN` とは別物なので、GitHub secrets は増やしません。

## スタック

- **Worker**: Hono on Cloudflare Workers（ダッシュボードは `public/` の静的 HTML/CSS/JS）
- **Worker 名**: `html-hosting-myself`
- **オブジェクトストレージ**: Cloudflare R2 バケット `html-hosting-myself`（binding `BUCKET`）。Deploy が GitHub secrets のアカウントに作成する
- **メタデータ**: Cloudflare D1 `html-hosting-myself-db` + Drizzle ORM。UUID は Deploy が作成時に解決する
- **メモ / 追記リサーチ**: D1 `annotations` テーブル。追記リサーチは Workers AI（binding `AI`）
- **認証**: Cloudflare Access ヘッダ、または `Authorization: Bearer <API_TOKEN>`。どちらも未設定の初回はダッシュボード書き込みを許可する。ページ上のメモ API は anonymous を拒否する
- **テスト**: vitest + @cloudflare/vitest-pool-workers
- **Observability**: Workers Logs / Metrics が既定で ON

`research-host-db` / `research-host` は別 Cloudflare アカウントのリソースです。このリポジトリの CI からは使いません。

## ローカル開発

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

http://localhost:8787 で開きます。

## アップロードの流れ

1. ダッシュボードで単一の `.html`、または HTML/CSS/JS/画像を含む `.zip` をドロップする
2. 既定 TTL は **期限なし**（必要なら 1 日 / 7 日 / 30 日も選択可）
3. 発行された URL をコピーして、あとからスマホなどで開く
4. 一覧から削除、または期限付きにしたものを「期限なしにする」ができる

### スマホでメモ / 追記リサーチ

閲覧ページ（`/p/:slug/`）で本文を選択すると、下に **メモ** と **追記リサーチ** が出ます。書庫バーの「メモ」から、そのページに残した注釈一覧も開けます。

- メモは選択箇所（引用テキスト）に紐づけて D1 に保存します。再訪するとハイライトとピンが復元されます
- 追記リサーチは選択箇所 + ページ題 + 任意の質問を Workers AI に渡し、日本語の整理結果を同じ箇所に保存します（ライブ検索はしません。文脈中の URL は出典として使います）
- メモ API は Cloudflare Access のメール、または `API_TOKEN` の Bearer が必要です。ページ本体が公開でも、注釈は世界書き込みになりません

ZIP のサブページ（例: `/p/:slug/notes/a.html`）でも、パスごとに注釈を分けて保存します。

ZIP は共通のルートフォルダを自動で剥がします。HTML は `Content-Type: text/html` でページとして描画されます。閲覧 URL（`/p/*`）はログイン不要です。

## API

```bash
curl -X POST "https://html-hosting-myself.kaito-technology.workers.dev/api/upload" \
  -H "Authorization: Bearer $API_TOKEN" \
  -F "file=@index.html"
```

`API_TOKEN` が未設定のときは、Authorization ヘッダなしでも同じフォームを送れます。

| メソッド | パス                                    | 内容                                                                              |
| -------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| `POST`   | `/api/upload`                           | `file`（html/zip）と任意の `ttl`（省略時は `keep`。`1d` / `7d` / `30d` / `keep`） |
| `GET`    | `/api/hosts`                            | ホスト一覧                                                                        |
| `PATCH`  | `/api/hosts/:slug`                      | `{ "ttl": "keep" }` などで期限を変更                                              |
| `DELETE` | `/api/hosts/:slug`                      | 削除（R2 上のファイルとメモも消す）                                               |
| `GET`    | `/api/hosts/:slug/annotations`          | メモ一覧（`?path=` でページ絞り込み）                                             |
| `POST`   | `/api/hosts/:slug/annotations`          | メモ作成 `{ quote, body, pagePath }`                                              |
| `POST`   | `/api/hosts/:slug/annotations/research` | 追記リサーチ（Workers AI）。結果を同じ箇所に保存                                  |
| `PATCH`  | `/api/hosts/:slug/annotations/:id`      | メモ本文の更新                                                                    |
| `DELETE` | `/api/hosts/:slug/annotations/:id`      | メモ削除                                                                          |

## 主なコマンド

| コマンド                                      | 内容                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                                    | ローカル開発サーバー（wrangler dev）                                       |
| `pnpm typecheck`                              | wrangler types + tsc                                                       |
| `pnpm test`                                   | vitest（Workers ランタイム内で実行）                                       |
| `pnpm lint` / `pnpm format`                   | Prettier                                                                   |
| `pnpm db:generate`                            | `db/schema.ts` の変更から SQL マイグレーションを生成                       |
| `pnpm db:migrate:local` / `db:migrate:remote` | ローカル / リモート D1 にマイグレーション適用                              |
| `pnpm deploy`                                 | build（typecheck）→ リモートマイグレーション（predeploy）→ wrangler deploy |
| `pnpm security:ash`                           | ASH セキュリティスキャンをローカルで実行（docker が必要）                  |

## Cloudflare Access（後から足す場合）

初回は Access なしです。本番でダッシュボードを閉じたいときは Zero Trust で Self-hosted Application を追加し、`/p/*` に Bypass を付ければ閲覧 URL はログインなしのままにできます。エージェントからの `POST /api/upload` は `/api/*` を Bypass し、Worker 側の `API_TOKEN` で守ります。ページ上のメモ / 追記リサーチは Access のメールヘッダか `API_TOKEN` が無いと 401 になります。

## Workers AI

`wrangler.jsonc` の `"ai": { "binding": "AI" }` で Workers AI を繋いでいます。追記リサーチは `@cf/meta/llama-3.1-8b-instruct-fast` を使います。

ダッシュボードで初めて Workers AI を使うアカウントは、[Workers AI](https://dash.cloudflare.com/?to=/:account/ai/workers-ai) で利用規約への同意が必要な場合があります。CI の `wrangler deploy` ではこのトグルを代行できません。モデル呼び出しが 503 になるときは、そこを確認してください。

## エージェント向け

- ルール・MCP・hooks は `.rulesync/` が正本。変更したら `pnpm dlx rulesync generate --targets "*"` で各エージェント設定を再生成する
- MCP: cloudflare-docs（認証不要）/ cloudflare-observability（初回 OAuth）が既定で入っている
