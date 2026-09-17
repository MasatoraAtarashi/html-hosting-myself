import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

// 長さが違う場合に早期 return するとタイミングが漏れるため、長さも混ぜて比較する
function tokenMatches(expected: string, provided: string): boolean {
  const max = Math.max(expected.length, provided.length);
  let diff = expected.length ^ provided.length;
  for (let i = 0; i < max; i++) {
    diff |= (expected.charCodeAt(i) ?? 0) ^ (provided.charCodeAt(i) ?? 0);
  }
  return diff === 0;
}

export interface WriterInput {
  accessEmail: string | undefined;
  hostname: string;
  localDevEmail: string | undefined;
  expectedToken: string | undefined;
  providedToken: string | null;
}

/**
 * 書き込み API の認証。
 * 1. Cloudflare Access のメールヘッダ（任意。後から Access を足した場合）
 * 2. localhost かつ LOCAL_DEV_USER_EMAIL（ローカル開発）
 * 3. Authorization: Bearer <API_TOKEN>（エージェント / CI。トークンが設定されている場合）
 * 4. API_TOKEN 未設定なら、ダッシュボードからの書き込みを許可する（preview の初回試用）
 *
 * 初回デプロイでは Cloudflare Access を必須にしない。
 */
export function resolveWriter(input: WriterInput): string | null {
  if (input.accessEmail) {
    return decodeURIComponent(input.accessEmail);
  }

  const isLocal = input.hostname === "localhost" || input.hostname.startsWith("127.0.0.1");
  if (isLocal && input.localDevEmail) {
    return input.localDevEmail;
  }

  const expected = input.expectedToken;
  if (expected && input.providedToken && tokenMatches(expected, input.providedToken)) {
    return "api-token";
  }

  // preview / 初回試用: secret が未設定ならダッシュボードからアップロードできる
  if (!expected) {
    return "anonymous";
  }

  return null;
}

export const writeAuth = createMiddleware<AppEnv>(async (c, next) => {
  const email = resolveWriter({
    accessEmail: c.req.header("cf-access-authenticated-user-email"),
    hostname: new URL(c.req.url).hostname,
    localDevEmail: c.env.LOCAL_DEV_USER_EMAIL,
    expectedToken: c.env.API_TOKEN,
    providedToken: bearerToken(c.req.header("authorization")),
  });

  if (!email) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("userEmail", email);
  await next();
});

/** テンプレート互換の別名（配線は writeAuth） */
export const accessAuth = writeAuth;
