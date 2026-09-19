import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const dashboardHtml = import.meta.glob("../public/index.html", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const iconFiles = import.meta.glob("../public/{favicon.png,favicon.ico,apple-touch-icon.png}", {
  query: "?inline",
  import: "default",
  eager: true,
}) as Record<string, string>;

function fileBytes(name: string): Uint8Array {
  const dataUrl = Object.entries(iconFiles).find(([path]) => path.endsWith(`/${name}`))?.[1];
  if (!dataUrl) {
    throw new Error(`${name} が public/ にありません: ${Object.keys(iconFiles).join(",")}`);
  }
  const comma = dataUrl.indexOf(",");
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("dashboard favicon", () => {
  it("絵文字 data-URI ではなく実ファイルを参照する", () => {
    const html = Object.values(dashboardHtml)[0];
    expect(html).toContain('rel="icon"');
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('href="/favicon.png"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('href="/apple-touch-icon.png"');
    expect(html).toContain("multiple");
    expect(html).toContain('id="file-input"');
    expect(html).not.toContain("data:image/svg+xml");
    expect(html).not.toContain("📦");
  });

  it("favicon.png は 32x32 の PNG である", () => {
    const bytes = fileBytes("favicon.png");
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(pngSize(bytes)).toEqual({ width: 32, height: 32 });
  });

  it("apple-touch-icon.png は 180x180 の PNG である", () => {
    const bytes = fileBytes("apple-touch-icon.png");
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(pngSize(bytes)).toEqual({ width: 180, height: 180 });
  });

  it("favicon.ico は 16px と 32px を含む ICO である", () => {
    const bytes = fileBytes("favicon.ico");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    const count = view.getUint16(4, true);
    expect(count).toBeGreaterThanOrEqual(2);
    const widths = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      const width = view.getUint8(6 + i * 16);
      widths.add(width === 0 ? 256 : width);
    }
    expect(widths.has(16)).toBe(true);
    expect(widths.has(32)).toBe(true);
  });

  it("Static Assets 経由で favicon を 200 で返す", async () => {
    const png = await exports.default.fetch("https://example.com/favicon.png");
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toMatch(/image\/png/);
    const pngBytes = new Uint8Array(await png.arrayBuffer());
    expect(Array.from(pngBytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    const ico = await exports.default.fetch("https://example.com/favicon.ico");
    expect(ico.status).toBe(200);
    const icoBytes = new Uint8Array(await ico.arrayBuffer());
    expect(icoBytes[0]).toBe(0);
    expect(icoBytes[1]).toBe(0);
    expect(icoBytes[2]).toBe(1);
    expect(icoBytes[3]).toBe(0);

    const apple = await exports.default.fetch("https://example.com/apple-touch-icon.png");
    expect(apple.status).toBe(200);
    expect(apple.headers.get("content-type")).toMatch(/image\/png/);
    expect(apple.headers.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("存在しない favicon パスは 404 を返す", async () => {
    const res = await exports.default.fetch("https://example.com/favicon.svg");
    expect(res.status).toBe(404);
  });
});
