import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · FLUX Images" };

export default function SignInPage() {
  return (
    <main style={{ maxWidth: 360, paddingTop: "15vh" }}>
      <h1 style={{ marginBottom: 16 }}>Sign in</h1>
      <SignInForm />
    </main>
  );
}
