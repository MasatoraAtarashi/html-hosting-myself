// Hono アプリの環境型（Bindings は worker-configuration.d.ts の Env を使用）
export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    userEmail: string;
  };
};

declare global {
  interface Env {
    // .dev.vars でローカル開発時にだけ定義される（本番では未定義）
    LOCAL_DEV_USER_EMAIL?: string;
    // エージェント / CI 用。本番は wrangler secret、テストは wrangler.vitest.jsonc の vars
    API_TOKEN?: string;
    // vitest 専用。本番 wrangler.jsonc には置かない
    TEST_AI_RESPONSE?: string;
  }
}
