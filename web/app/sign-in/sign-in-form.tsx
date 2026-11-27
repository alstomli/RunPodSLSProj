"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { callApi } from "../call-api";

export function SignInForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await callApi("/api/auth/sign-in", {
      method: "POST",
      json: { email: form.get("email"), password: form.get("password") },
      error: "Sign-in failed. Try again.",
    });
    if (result.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    setError(result.error);
    setBusy(false);
  }

  return (
    <form method="post" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 4 }}>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
