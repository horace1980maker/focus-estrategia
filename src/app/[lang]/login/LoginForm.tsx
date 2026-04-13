"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "./actions";

type LoginFormProps = {
  lang: "es" | "en";
  nextPath?: string | null;
  homeLinkLabel: string;
};

const INITIAL_STATE = { error: null as string | null };

export function LoginForm({ lang, nextPath = null, homeLinkLabel }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(loginAction, INITIAL_STATE);

  return (
    <section className="login-shell">
      <article className="login-aside">
        <div className="login-aside-badge">
          {lang === "es" ? "Acompanamiento estrategico" : "Strategic accompaniment"}
        </div>
        <h1 className="login-aside-title">
          {lang === "es"
            ? "Accede a tu espacio de trabajo"
            : "Access your workspace"}
        </h1>
        <p className="login-aside-copy">
          {lang === "es"
            ? "Ingresaras con credenciales provisionadas para organizacion, facilitacion u oficiales."
            : "Sign in with provisioned credentials for organization, facilitator, or officials workspaces."}
        </p>
        <Link href={`/${lang}`} className="login-aside-home-link">
          {homeLinkLabel}
        </Link>
      </article>

      <form action={formAction} className="card login-card">
        <h2 className="login-title">{lang === "es" ? "Iniciar sesion" : "Sign in"}</h2>
        <p className="login-subtitle">
          {lang === "es"
            ? "Usa tu usuario y contrasena asignados."
            : "Use your assigned username and password."}
        </p>

        <input type="hidden" name="lang" value={lang} />
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

        <label className="login-field">
          <span>{lang === "es" ? "Usuario" : "Username"}</span>
          <input name="username" required className="input" autoComplete="username" />
        </label>

        <label className="login-field">
          <span>{lang === "es" ? "Contrasena" : "Password"}</span>
          <input
            name="password"
            type="password"
            required
            className="input"
            autoComplete="current-password"
          />
        </label>

        {state.error ? <p className="login-error">{state.error}</p> : null}

        <button type="submit" className="btn btn-primary login-submit" disabled={isPending}>
          {isPending
            ? lang === "es"
              ? "Validando..."
              : "Signing in..."
            : lang === "es"
              ? "Entrar"
              : "Sign in"}
        </button>
      </form>
    </section>
  );
}
