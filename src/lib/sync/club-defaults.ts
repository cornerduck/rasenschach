/**
 * Startwerte für Vereine: Kürzel (Badge) und Trikotfarben für die Trikot-Grafik.
 * Schlüssel ist die OpenLigaDB-Team-ID. Wird nur beim ersten Anlegen verwendet,
 * danach gelten die Werte in der Datenbank (dort änderbar).
 */
export const CLUB_DEFAULTS: Record<string, { code: string; primary: string; secondary: string }> = {
  "134": { code: "SVW", primary: "#1D9053", secondary: "#FFFFFF" }, // Werder Bremen
  "40": { code: "FCB", primary: "#DC052D", secondary: "#FFFFFF" }, // Bayern München
  "7": { code: "BVB", primary: "#FDE100", secondary: "#000000" }, // Borussia Dortmund
  "6": { code: "B04", primary: "#E32221", secondary: "#000000" }, // Bayer Leverkusen
  "1635": { code: "RBL", primary: "#FFFFFF", secondary: "#DD0741" }, // RB Leipzig
  "16": { code: "VFB", primary: "#FFFFFF", secondary: "#E32219" }, // VfB Stuttgart
  "91": { code: "SGE", primary: "#000000", secondary: "#E1000F" }, // Eintracht Frankfurt
  "112": { code: "SCF", primary: "#E2001A", secondary: "#FFFFFF" }, // SC Freiburg
  "175": { code: "TSG", primary: "#1961B5", secondary: "#FFFFFF" }, // Hoffenheim
  "87": { code: "BMG", primary: "#FFFFFF", secondary: "#000000" }, // Gladbach
  "95": { code: "FCA", primary: "#FFFFFF", secondary: "#BA3733" }, // Augsburg
  "81": { code: "M05", primary: "#C3141E", secondary: "#FFFFFF" }, // Mainz 05
  "80": { code: "FCU", primary: "#D4011D", secondary: "#FFFFFF" }, // Union Berlin
  "65": { code: "KOE", primary: "#FFFFFF", secondary: "#ED1C24" }, // 1. FC Köln
  "100": { code: "HSV", primary: "#FFFFFF", secondary: "#0A3F86" }, // Hamburger SV
  "9": { code: "S04", primary: "#004D9D", secondary: "#FFFFFF" }, // Schalke 04
  "31": { code: "SCP", primary: "#005CA9", secondary: "#FFFFFF" }, // SC Paderborn
  "198": { code: "SVE", primary: "#000000", secondary: "#FFFFFF" }, // SV Elversberg
};
