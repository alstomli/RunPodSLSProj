import { describe, expect, it } from "vitest";
import { appUrl, Browser, createUser } from "./app";

/** Where a redirect response sends the browser (path only). */
const redirectPath = (response: Response) => new URL(response.headers.get("location")!, appUrl).pathname;

describe("a visitor who isn't signed in", () => {
  it("is sent from the main page to sign-in", async () => {
    const response = await new Browser().get("/");

    expect(response.status).toBe(307);
    expect(redirectPath(response)).toBe("/sign-in");
  });

  it("can open the sign-in page", async () => {
    const response = await new Browser().get("/sign-in");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Sign in");
  });

  it("gets 401 from every server route except sign-in", async () => {
    const browser = new Browser();
    for (const [method, path] of [
      ["GET", "/api/me"],
      ["POST", "/api/auth/sign-out"],
      ["GET", "/api/no-such-route"],
      ["POST", "/api/jobs"],
      ["GET", "/api/jobs/00000000-0000-4000-8000-000000000000"],
      ["GET", "/api/images/00000000-0000-4000-8000-000000000000/file"],
      ["GET", "/api/images/00000000-0000-4000-8000-000000000000/file?download=1"],
      ["GET", "/api/images"],
    ]) {
      const response = await browser.request(method, path);
      expect(response.status, `${method} ${path}`).toBe(401);
      expect((await response.json()).error).toBeTruthy();
    }
  });
});

describe("signing in", () => {
  it("with a wrong password gets 401 and a message", async () => {
    const user = await createUser();
    const browser = new Browser();

    const response = await browser.post("/api/auth/sign-in", { email: user.email, password: "wrong-password" });

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Wrong email or password.");
    expect((await browser.get("/api/me")).status).toBe(401);
  });

  it("with the right email and password sets a session and shows the main page", async () => {
    const user = await createUser();
    const browser = new Browser();

    const response = await browser.post("/api/auth/sign-in", { email: user.email, password: user.password });

    expect(response.status).toBe(200);
    expect(browser.cookies.size).toBeGreaterThan(0);
    const page = await browser.get("/");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Sign out");
  });

  it("lets the server act as that User", async () => {
    const user = await createUser();
    const browser = new Browser();
    await browser.signIn(user);

    const response = await browser.get("/api/me");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { id: user.id, email: user.email } });
  });

  it("sends a signed-in User from the sign-in page to the main page", async () => {
    const browser = new Browser();
    await browser.signIn(await createUser());

    const response = await browser.get("/sign-in");

    expect(response.status).toBe(307);
    expect(redirectPath(response)).toBe("/");
  });

  it("is not possible through a sign-up page or route", async () => {
    const browser = new Browser();
    await browser.signIn(await createUser());

    expect((await browser.get("/sign-up")).status).toBe(404);
    expect((await browser.post("/api/auth/sign-up", { email: "new@example.test", password: "pw-123456" })).status).toBe(404);
  });

  it("with an unknown email gets the same 401 and message", async () => {
    const response = await new Browser().post("/api/auth/sign-in", {
      email: "nobody-here@example.test",
      password: "whatever-password",
    });

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Wrong email or password.");
  });
});

describe("signing out", () => {
  it("ends the session: protected routes return 401 and pages send to sign-in", async () => {
    const browser = new Browser();
    await browser.signIn(await createUser());

    const response = await browser.post("/api/auth/sign-out");

    expect(response.status).toBe(200);
    expect((await browser.get("/api/me")).status).toBe(401);
    expect(redirectPath(await browser.get("/"))).toBe("/sign-in");
  });

  it("also rejects a copy of the old session cookies", async () => {
    const browser = new Browser();
    await browser.signIn(await createUser());
    const copy = browser.clone();

    await browser.post("/api/auth/sign-out");

    expect((await copy.get("/api/me")).status).toBe(401);
  });

  it("leaves the User's other sessions signed in", async () => {
    const user = await createUser();
    const laptop = new Browser();
    const phone = new Browser();
    await laptop.signIn(user);
    await phone.signIn(user);

    await laptop.post("/api/auth/sign-out");

    expect((await phone.get("/api/me")).status).toBe(200);
  });
});
