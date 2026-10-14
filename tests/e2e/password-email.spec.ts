import { expect, test } from "@playwright/test";

const employee = {
  id: "55555555-5555-4555-8555-555555555555",
  email: "password-flow@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

test("expired email links explain that a new link is needed", async ({
  page,
}) => {
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.goto(
    "/?setup=password#error=access_denied&error_code=otp_expired",
  );
  await expect(
    page.getByText(
      "This password link is invalid or has expired. Ask your administrator to send a new password reset email.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create your password" }),
  ).toHaveCount(0);
});

for (const type of ["invite", "recovery"]) {
  test(`${type} email opens password setup and saves the password in a fresh browser`, async ({
    page,
  }) => {
    let savedPassword: string | undefined;
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = new URL(route.request().url());
      let body: unknown = [];
      if (url.pathname === "/auth/v1/user") {
        if (route.request().method() === "PUT")
          savedPassword = route.request().postDataJSON().password;
        body = employee;
      } else if (url.pathname === "/rest/v1/users") {
        body = { full_name: "Password Flow Test", role: "EMPLOYEE" };
      }
      await route.fulfill({ json: body });
    });
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const accessToken =
      [
        { alg: "HS256", typ: "JWT" },
        { sub: employee.id, aud: "authenticated", exp: expires },
      ]
        .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
        .join(".") + ".test-signature";
    const fragment = new URLSearchParams({
      access_token: accessToken,
      refresh_token: "test-refresh-token",
      expires_in: "3600",
      token_type: "bearer",
      type,
    });
    // The invitation case deliberately omits the query marker, covering old
    // links whose destination was only the site origin.
    await page.goto(
      `${type === "recovery" ? "/?setup=password" : "/"}#${fragment}`,
    );
    await expect(
      page.getByRole("heading", { name: "Create your password" }),
    ).toBeVisible();
    await page
      .getByLabel("New password", { exact: true })
      .fill("Test-only-password-123!");
    await page
      .getByLabel("Confirm password", { exact: true })
      .fill("Test-only-password-123!");
    await page
      .getByRole("button", { name: "Create password", exact: true })
      .click();
    await expect.poll(() => savedPassword).toBe("Test-only-password-123!");
    await expect(
      page.getByRole("heading", { name: "Create your password" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toHaveCount(0);
    await expect(page).not.toHaveURL(/setup=password/);
  });
}
