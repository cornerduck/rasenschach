import { describe, expect, it } from "vitest";
import { checkLogo, detectImageType, logoPath, MAX_LOGO_BYTES } from "./image";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe("Vereinslogos: Bildprüfung", () => {
  it("erkennt PNG, JPG und WebP am Inhalt", () => {
    expect(detectImageType(png)?.ext).toBe("png");
    expect(detectImageType(jpg)?.ext).toBe("jpg");
    expect(detectImageType(webp)?.ext).toBe("webp");
  });
  it("lehnt SVG und anderes ab", () => {
    expect(detectImageType(svg)).toBeNull();
    expect(checkLogo(svg)).toEqual({ ok: false, error: "Bitte ein PNG-, JPG- oder WebP-Bild hochladen" });
    expect(checkLogo(new Uint8Array())).toMatchObject({ ok: false });
  });
  it("höchstens 1 MB", () => {
    const big = new Uint8Array(MAX_LOGO_BYTES + 1);
    big.set(png);
    expect(checkLogo(big)).toEqual({ ok: false, error: "Die Datei ist größer als 1 MB" });
    expect(checkLogo(png)).toMatchObject({ ok: true, type: { mime: "image/png" } });
  });
  it("Pfad im Bucket", () => {
    expect(logoPath("SVW", "png")).toBe("svw.png");
  });
});
