import type { ClubLogoData } from "@/components/ClubLogo";

/**
 * Nur Logos aus dem eigenen Speicher anzeigen. Eine fremde Adresse (z. B. vor der
 * Logo-Migration) wird ignoriert, damit Seitenaufrufe nie fremde Server abfragen.
 */
export function ownLogoUrl(url: string | null | undefined): string | null {
  return url && url.includes("/storage/v1/object/public/vereinslogos/") ? url : null;
}

export function clubLogo(c: { code: string; color_primary: string; color_secondary: string; logo_url: string | null }): ClubLogoData {
  return { code: c.code, primary: c.color_primary, secondary: c.color_secondary, logoUrl: ownLogoUrl(c.logo_url) };
}
