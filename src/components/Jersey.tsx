/** Trikot in Vereinsfarbe mit Rückennummer (statt Spielerfoto) */
export function Jersey({
  primary,
  secondary,
  number,
  width = 62,
  label = true,
}: {
  primary: string;
  secondary: string;
  number: number | null;
  width?: number;
  /** false = rein dekorativ (Name steht daneben) */
  label?: boolean;
}) {
  const nr = number ?? "";
  return (
    <svg
      width={width}
      height={Math.round((width * 76) / 80)}
      viewBox="0 0 80 76"
      {...(label ? { role: "img", "aria-label": number ? `Trikot mit Rückennummer ${number}` : "Trikot ohne Rückennummer" } : { "aria-hidden": true })}
    >
      <path
        d="M22 6 L32 3 Q40 10 48 3 L58 6 L74 20 L64 32 L58 27 L58 73 L22 73 L22 27 L16 32 L6 20 Z"
        fill={primary}
        stroke={secondary}
        strokeWidth={width < 40 ? 3 : 2.5}
        strokeLinejoin="round"
      />
      <text x="40" y="56" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="800" fontSize={width < 40 ? 30 : 28} fill={secondary}>
        {nr}
      </text>
    </svg>
  );
}
