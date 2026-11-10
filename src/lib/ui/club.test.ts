import { describe, expect, it } from "vitest";
import { clubLogo, ownLogoUrl } from "./club";

describe("Vereinslogos: nur eigener Speicher", () => {
  it("fremde Adressen werden nicht angezeigt", () => {
    expect(ownLogoUrl("https://upload.wikimedia.org/x.svg")).toBeNull();
    expect(ownLogoUrl(null)).toBeNull();
    const own = "https://abc.supabase.co/storage/v1/object/public/vereinslogos/svw.png?v=1";
    expect(ownLogoUrl(own)).toBe(own);
  });
  it("Daten für die Anzeige", () => {
    expect(clubLogo({ code: "SVW", color_primary: "#1D9053", color_secondary: "#FFFFFF", logo_url: "https://i.imgur.com/a.png" })).toEqual({
      code: "SVW", primary: "#1D9053", secondary: "#FFFFFF", logoUrl: null,
    });
  });
});
