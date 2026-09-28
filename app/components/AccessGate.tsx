"use client";

import { FormEvent, useState } from "react";

interface AccessGateProps {
  onAuthenticated: () => void;
}

export function AccessGate({ onAuthenticated }: AccessGateProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
            ? payload.error
            : "Die Anmeldung ist fehlgeschlagen.",
        );
      }
      onAuthenticated();
    } catch (submitError) {
      console.error("Demo access login failed:", submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Die Anmeldung ist fehlgeschlagen.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f9fc] px-5">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
          Sourcewise
        </p>
        <h1 className="mt-3 text-xl font-semibold text-slate-950">Demo-Zugang</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Gib das Demo-Passwort ein, um auf die gespeicherten Quellen zuzugreifen.
        </p>
        <label htmlFor="demo-password" className="mt-6 block text-sm font-medium text-slate-700">
          Passwort
        </label>
        <input
          id="demo-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
        />
        {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={!password || isSubmitting}
          className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Anmeldung läuft …" : "Anmelden"}
        </button>
      </form>
    </main>
  );
}
