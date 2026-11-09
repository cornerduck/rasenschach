"use client";

import { useRouter } from "next/navigation";

export function SeasonSelect({ seasons, current }: { seasons: { year: number; name: string }[]; current: number }) {
  const router = useRouter();
  return (
    <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      Saison
      <select
        className="select"
        style={{ padding: "10px 12px" }}
        value={current}
        onChange={(e) => router.push(`/?saison=${e.target.value}`)}
      >
        {seasons.map((s) => (
          <option key={s.year} value={s.year}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
