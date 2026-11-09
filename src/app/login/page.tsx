import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Login · Rasenschach" };

export default function LoginPage() {
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <Logo size={40} />
          <span className="brand-name">RASENSCHACH</span>
        </div>
        <p className="muted login-sub">
          <span style={{ color: "var(--bent-light)", fontWeight: 600 }}>Bent</span> gegen{" "}
          <span style={{ color: "var(--bjoern-light)", fontWeight: 600 }}>Björn</span> · Bundesliga 2026/27
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
