# html-hosting-myself

自分用の薄い静的ホスティング。AI が作った HTML や静的サイトの ZIP を置いて短い URL で共有します。BASE の [pon](https://devblog.thebase.in/entry/pon) や [ssss](https://ssss-app.com) の「置いて共有する」体験を、Cloudflare Worker **`html-hosting-myself`** 上で動かします。

UI は HTML をドロップするダッシュボードです。

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

Workers の概要ページ右サイドバー、またはダッシュボード URL の `dash.cloudflare.com/<ACCOUNT_ID>/...` です。

### 2. Deploy を再実行する

secret を入れたあと:

1. `main` に push する（またはすでに `main` にある場合はそのまま）
2. GitHub Actions の **Deploy** ワークフローを開く
3. 直前の実行が secret 空で落ちていれば **Re-run jobs**
4. トークンが空なら migrate / deploy の前に失敗します（分かりやすいエラーメッセージ）

`main` への push では次の順で動きます。

1. typecheck / test（PR Checks）
2. `wrangler d1 migrations apply DB --remote`（D1 `research-host-db`）
3. `wrangler deploy`（Worker 名 **`html-hosting-myself`**）

### 3. workers.dev を開いて HTML を置く

デプロイ後の URL:

**https://html-hosting-myself.kaito-technology.workers.dev**

ダッシュボードに `.html` または `.zip` をドロップすると `/p/<slug>/` の共有 URL が発行されます。

### 4. （任意）書き込みを閉じる

初回は `API_TOKEN` も Access も未設定なら、ダッシュボードからのアップロードが通るようにしています。閉じるとき:

```bash
pnpm exec wrangler secret put API_TOKEN
```

これは **Worker secret** です。GitHub の `CLOUDFLARE_API_TOKEN` とは別物なので、GitHub secrets は増やしません。

## スタック

- **Worker**: Hono on Cloudflare Workers（ダッシュボードは `public/` の静的 HTML/CSS/JS）
- **Worker 名**: `html-hosting-myself`
- **オブジェクトストレージ**: Cloudflare R2 バケット `research-host`（binding `BUCKET`）
- **メタデータ**: Cloudflare D1 `research-host-db`（id `8aabd19d-7950-4a92-b33c-4ba9d3f7d42c`）+ Drizzle ORM
- **認証**: Cloudflare Access ヘッダ、または `Authorization: Bearer <API_TOKEN>`。どちらも未設定の初回はダッシュボード書き込みを許可する
- **テスト**: vitest + @cloudflare/vitest-pool-workers
- **Observability**: Workers Logs / Metrics が既定で ON

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
2. 既定 TTL は **7 日**（1 日 / 30 日 / 期限なし も選択可）
3. 発行された URL をコピーして共有する
4. 一覧から削除、または「期限なしにする」ができる

ZIP は共通のルートフォルダを自動で剥がします。HTML は `Content-Type: text/html` でページとして描画されます。共有 URL（`/p/*`）はログイン不要です。

## API

```bash
curl -X POST "https://html-hosting-myself.kaito-technology.workers.dev/api/upload" \
  -H "Authorization: Bearer $API_TOKEN" \
  -F "file=@index.html" \
  -F "ttl=7d"
```

`API_TOKEN` が未設定のときは、Authorization ヘッダなしでも同じフォームを送れます。

| メソッド | パス               | 内容                                                             |
| -------- | ------------------ | ---------------------------------------------------------------- |
| `POST`   | `/api/upload`      | `file`（html/zip）と任意の `ttl`（`1d` / `7d` / `30d` / `keep`） |
| `GET`    | `/api/hosts`       | ホスト一覧                                                       |
| `PATCH`  | `/api/hosts/:slug` | `{ "ttl": "keep" }` などで期限を変更                             |
| `DELETE`  | `/api/hosts/:slug` | 削除（R2 上のファイルも消す）                                    |

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

初回は Access なしです。本番でダッシュボードを閉じたいときは Zero Trust で Self-hosted Application を追加し、`/p/*` に Bypass を付ければ共有 URL はログインなしのままにできます。エージェントからの `POST /api/upload` は `/api/*` を Bypass し、Worker 側の `API_TOKEN` で守ります。

## エージェント向け

- ルール・MCP・hooks は `.rulesync/` が正本。変更したら `pnpm dlx rulesync generate --targets "*"` で各エージェント設定を再生成する
- MCP: cloudflare-docs（認証不要）/ cloudflare-observability（初回 OAuth）が既定で入っている
