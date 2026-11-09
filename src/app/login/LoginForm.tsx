"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initial: LoginState = { error: null, email: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);

  return (
    <form action={action} className="login-form" noValidate>
      <label className="field">
        E-Mail
        <input className="input" type="email" name="email" autoComplete="username" defaultValue={state.email} required />
      </label>
      <label className="field">
        Passwort
        <input className="input" type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.error && (
        <p className="error-box" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Einloggen …" : "Einloggen"}
      </button>
    </form>
  );
}
