import { SignOutButton } from "./sign-out-button";

/** The main page. Only signed-in Users get here (see proxy.ts). Later tickets add the form and Gallery. */
export default function MainPage() {
  return (
    <main>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>FLUX Images</h1>
        <SignOutButton />
      </header>
    </main>
  );
}
