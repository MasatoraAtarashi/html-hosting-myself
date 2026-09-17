import { describe, expect, it } from "vitest";
import { unpackZip, ZipError } from "../server/hosting/zip";
import { zipSync, strToU8 } from "fflate";

describe("unpackZip", () => {
  it("共通ルートディレクトリを剥がす", () => {
    const zipped = zipSync({
      "bundle/index.html": strToU8("<h1>root</h1>"),
      "bundle/a.js": strToU8("console.log(1)"),
    });
    const files = unpackZip(zipped);
    expect(files.map((file) => file.path).sort()).toEqual(["a.js", "index.html"]);
  });

  it("パストラバーサルを含む ZIP は拒否する", () => {
    const zipped = zipSync({
      "index.html": strToU8("<p>ok</p>"),
      "ok/../../secret.txt": strToU8("nope"),
    });
    expect(() => unpackZip(zipped)).toThrow(ZipError);
  });
});
