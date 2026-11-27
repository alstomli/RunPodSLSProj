import { Gallery } from "./gallery";
import { Generator } from "./generator";
import { SignOutButton } from "./sign-out-button";

/** The main page. Only signed-in Users get here (see proxy.ts). */
export default function MainPage() {
  return (
    <main style={{ display: "grid", gap: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>FLUX Images</h1>
        <SignOutButton />
      </header>
      <Generator />
      <Gallery />
    </main>
  );
}
