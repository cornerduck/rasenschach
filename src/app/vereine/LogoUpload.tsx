"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { uploadClubLogo } from "./actions";

const MAX = 1024 * 1024;

/** Logo eines Vereins ersetzen (PNG, JPG oder WebP, höchstens 1 MB) */
export function LogoUpload({ clubId, clubName }: { clubId: number; clubName: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onFile = (file: File | undefined) => {
    setError(null);
    setDone(false);
    if (!file) return;
    if (file.size > MAX) return setError("Die Datei ist größer als 1 MB");
    const data = new FormData();
    data.set("clubId", String(clubId));
    data.set("logo", file);
    startTransition(async () => {
      const res = await uploadClubLogo(data);
      if (input.current) input.current.value = "";
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else setError(res.error);
    });
  };

  return (
    <div className="logo-upload">
      <label className="btn btn-small btn-secondary">
        {pending ? "Lade hoch …" : "Logo ersetzen"}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="visually-hidden"
          disabled={pending}
          aria-label={`Neues Logo für ${clubName}`}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
      {done && <span className="ok-bent" style={{ fontSize: 12 }}>✓ gespeichert</span>}
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
