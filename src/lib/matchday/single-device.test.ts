import { describe, expect, it } from "vitest";
import { actingSlot, confirmableFor, draftActor, handoverTo, type Viewer } from "./single-device";

const admin = (singleDevice: boolean): Viewer => ({ mySlot: "bent", isAdmin: true, singleDevice });
const bjoern = (singleDevice: boolean): Viewer => ({ mySlot: "bjoern", isAdmin: false, singleDevice });

describe("Ein-Gerät-Modus: für wen darf gehandelt werden", () => {
  it("für sich selbst immer", () => {
    expect(actingSlot(admin(false))).toEqual({ ok: true, slot: "bent", shared: false });
    expect(actingSlot(bjoern(true), "bjoern")).toEqual({ ok: true, slot: "bjoern", shared: false });
  });
  it("Admin für Björn nur mit aktivem Modus, dann mit Vermerk", () => {
    expect(actingSlot(admin(false), "bjoern")).toEqual({ ok: false, error: "Ohne Ein-Gerät-Modus darfst du nicht für den anderen handeln" });
    expect(actingSlot(admin(true), "bjoern")).toEqual({ ok: true, slot: "bjoern", shared: true });
  });
  it("Björn darf nie für den Admin handeln, auch nicht im Modus", () => {
    expect(actingSlot(bjoern(true), "bent")).toEqual({ ok: false, error: "Nur der Admin darf für den anderen handeln" });
  });
  it("ohne Profil gar nicht", () => {
    expect(actingSlot({ mySlot: null, isAdmin: true, singleDevice: true }, "bjoern")).toMatchObject({ ok: false });
  });
});

describe("Ein-Gerät-Modus: Draft", () => {
  it("im Modus zieht der Admin für den, der dran ist", () => {
    expect(draftActor(admin(true), "bjoern")).toBe("bjoern");
    expect(draftActor(admin(true), "bent")).toBe("bent");
    expect(draftActor(admin(true), null)).toBeNull();
  });
  it("ohne Modus nur für sich; Björns Konto immer nur für Björn", () => {
    expect(draftActor(admin(false), "bjoern")).toBe("bent");
    expect(draftActor(bjoern(true), "bent")).toBe("bjoern");
  });
  it("Übergabe nur, wenn der Zieher wechselt (Snake: zwei Züge am Stück ohne Übergabe)", () => {
    expect(handoverTo("bent", "bjoern")).toBe("bjoern");
    expect(handoverTo("bjoern", "bjoern")).toBeNull();
    expect(handoverTo("bjoern", null)).toBeNull(); // Draft fertig
  });
});

describe("Ein-Gerät-Modus: Thesen bestätigen", () => {
  it("Admin im Modus darf für beide bestätigen, ohne Modus nur für sich", () => {
    expect(confirmableFor(admin(true), ["bent", "bjoern"])).toEqual(["bent", "bjoern"]);
    expect(confirmableFor(admin(false), ["bent", "bjoern"])).toEqual(["bent"]);
    expect(confirmableFor(admin(false), ["bjoern"])).toEqual([]);
  });
  it("Björn nur für sich", () => {
    expect(confirmableFor(bjoern(true), ["bent", "bjoern"])).toEqual(["bjoern"]);
  });
});
