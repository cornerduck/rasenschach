import Link from "next/link";
import { AppHeader } from "./AppHeader";
import { SingleDeviceToggle } from "./SingleDeviceToggle";

export type Step = "thesen" | "vorbereitung" | "draft" | "spieler" | "spielfeld";

const STEPS: { key: Step; label: string; path: string | null }[] = [
  { key: "thesen", label: "Thesen", path: "thesen" },
  { key: "vorbereitung", label: "Spielvorbereitung", path: "vorbereitung" },
  { key: "draft", label: "Thesen-Draft", path: "thesen-draft" },
  { key: "spieler", label: "Spieler-Draft", path: "spieler-draft" },
  { key: "spielfeld", label: "Spielfeld", path: "spielfeld" },
];

/** Kopfzeile für die Spieltagsseiten mit Schrittleiste */
export function MatchdayHeader({
  number,
  step,
  mode,
}: {
  number: number;
  step: Step;
  /** Ein-Gerät-Modus: Schalter (Admin) bzw. Hinweis (Björn) */
  mode?: { matchdayId: number; on: boolean; isAdmin: boolean };
}) {
  const index = STEPS.findIndex((s) => s.key === step);
  const next = STEPS[index + 1];
  return (
    <>
      <AppHeader active="spieltag" chip={<span className="chip">Spieltag {String(number).padStart(2, "0")} · {STEPS[index].label}</span>} />
      <div className="stepbar">
        <ol className="steps" aria-label="Schritte">
          {STEPS.map((s, i) => {
            const content = (
              <>
                <span className="step-no">{i + 1}</span>
                {s.label}
              </>
            );
            return (
              <li key={s.key}>
                {s.path && s.key !== step ? (
                  <Link className="step" href={`/spieltag/${number}/${s.path}`}>
                    {content}
                  </Link>
                ) : (
                  <span className="step" aria-current={s.key === step ? "step" : undefined} aria-disabled={!s.path || undefined}>
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <span className="muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {mode && <SingleDeviceToggle matchdayId={mode.matchdayId} on={mode.on} isAdmin={mode.isAdmin} />}
          Schritt {index + 1} von {STEPS.length}
          {next ? ` · danach ${next.label}` : ""}
        </span>
      </div>
    </>
  );
}
