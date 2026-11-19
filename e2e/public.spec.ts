import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("landing page shows product and auth entry points", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("NIS2");
    await expect(page.getByRole("link", { name: "Accedi" }).first()).toBeVisible();
    await expect(page.getByText(/non costituisce certificazione/i).first()).toBeVisible();
  });

  test("security headers are set", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});

test.describe("route protection", () => {
  test("anonymous visitor is redirected from the dashboard to login with `next`", async ({ page }) => {
    await page.goto("/dashboard?tab=overview");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%3Ftab%3Doverview$/);
    await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();
  });

  for (const path of [
    "/settings/members",
    "/settings/audit",
    "/organizations/new",
    "/assessments",
    "/gap-analysis",
    "/tasks",
    "/reports",
  ]) {
    test(`anonymous visitor cannot open ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
    });
  }

  test("invite links survive the login redirect", async ({ page }) => {
    const token = "a".repeat(64);
    await page.goto(`/invite/${token}`);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Finvite%2F${token}$`));
  });

  test("invalid confirmation link ends on login with an error", async ({ page }) => {
    await page.goto("/auth/confirm?type=sms&token_hash=abc");
    await expect(page).toHaveURL(/\/login\?error=link_invalid$/);
    await expect(page.getByText(/link non è valido/i)).toBeVisible();
  });
});

test.describe("auth forms", () => {
  test("login form validates input client-side", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Accedi", exact: true }).click();
    await expect(page.getByText("Inserisci la tua email")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  });

  test("signup form enforces the password policy", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Nome e cognome").fill("Utente Demo");
    await page.getByLabel("Email di lavoro").fill("demo@example.com");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Conferma password").fill("different");
    await page.getByRole("button", { name: "Crea account" }).click();
    await expect(page.getByText(/Almeno 10 caratteri/).first()).toBeVisible();
    await expect(page.getByText("Le password non coincidono")).toBeVisible();
  });

  test("password visibility toggle is keyboard accessible", async ({ page }) => {
    await page.goto("/login");
    const password = page.getByLabel("Password", { exact: true });
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Mostra password" }).focus();
    await page.keyboard.press("Enter");
    await expect(password).toHaveAttribute("type", "text");
  });
});
