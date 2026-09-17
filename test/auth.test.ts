import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { resolveWriter } from "../server/middleware/access-auth";

describe("writeAuth ミドルウェア", () => {
  it("Access ヘッダがあれば 200 を返す", async () => {
    const res = await exports.default.fetch("https://example.com/api/hosts", {
      headers: { "cf-access-authenticated-user-email": "user@example.com" },
    });
    expect(res.status).toBe(200);
  });

  it("API_TOKEN があるとき、認証情報がなければアップロードを 401 で拒否する", async () => {
    const form = new FormData();
    form.set("file", new File(["<!doctype html><p>nope</p>"], "x.html", { type: "text/html" }));
    const res = await exports.default.fetch("https://example.com/api/upload", {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(401);
  });

  it("Bearer API トークンでもアップロードできる", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(["<!doctype html><title>token</title><p>ok</p>"], "token.html", {
        type: "text/html",
      }),
    );
    const res = await exports.default.fetch("https://example.com/api/upload", {
      method: "POST",
      headers: { authorization: "Bearer test-api-token" },
      body: form,
    });
    expect(res.status).toBe(201);
  });

  it("誤った Bearer トークンは 401 を返す", async () => {
    const form = new FormData();
    form.set("file", new File(["<!doctype html><p>x</p>"], "x.html", { type: "text/html" }));
    const res = await exports.default.fetch("https://example.com/api/upload", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token" },
      body: form,
    });
    expect(res.status).toBe(401);
  });
});

describe("resolveWriter", () => {
  it("API_TOKEN 未設定ならダッシュボードからの書き込みを許可する", () => {
    expect(
      resolveWriter({
        accessEmail: undefined,
        hostname: "html-hosting-myself.workers.dev",
        localDevEmail: undefined,
        expectedToken: undefined,
        providedToken: null,
      }),
    ).toBe("anonymous");
  });

  it("API_TOKEN があるのに Bearer が無いと拒否する", () => {
    expect(
      resolveWriter({
        accessEmail: undefined,
        hostname: "html-hosting-myself.workers.dev",
        localDevEmail: undefined,
        expectedToken: "secret",
        providedToken: null,
      }),
    ).toBeNull();
  });

  it("localhost では LOCAL_DEV_USER_EMAIL を使う", () => {
    expect(
      resolveWriter({
        accessEmail: undefined,
        hostname: "localhost",
        localDevEmail: "dev@example.com",
        expectedToken: undefined,
        providedToken: null,
      }),
    ).toBe("dev@example.com");
  });
});
