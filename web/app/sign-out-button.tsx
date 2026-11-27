"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => undefined);
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} disabled={busy}>
      Sign out
    </button>
  );
}
