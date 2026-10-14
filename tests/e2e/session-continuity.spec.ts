import { expect, test, type Page } from "@playwright/test";

const authUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "session-test@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const organizationId = "22222222-2222-4222-8222-222222222222";
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const session = {
  access_token:
    [
      { alg: "HS256", typ: "JWT" },
      { sub: authUser.id, aud: "authenticated", exp: expiresAt },
    ]
      .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
      .join(".") + ".test-signature",
  refresh_token: "test-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: expiresAt,
  user: authUser,
};

async function emitAuth(
  page: Page,
  event: string,
  nextSession: typeof session | null = session,
) {
  const cookie = (await page.context().cookies()).find((item) =>
    /^sb-.+-auth-token(?:\.\d+)?$/.test(item.name),
  );
  expect(cookie).toBeDefined();
  await page.evaluate(
    ({ name, event, session }) => {
      const channel = new BroadcastChannel(name);
      channel.postMessage({ event, session });
      channel.close();
    },
    { name: cookie!.name.replace(/\.\d+$/, ""), event, session: nextSession },
  );
  // Auth listeners defer profile work; let the receiving tab process the event.
  await page.waitForTimeout(300);
}

test.beforeEach(async ({ page }) => {
  // All Supabase requests are intercepted; these tests never create real users
  // or read/write production workforce data.
  await page.route("**/*.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname === "/auth/v1/token") body = session;
    else if (url.pathname === "/auth/v1/user") body = authUser;
    else if (url.pathname === "/rest/v1/users")
      body = {
        full_name: "Session Test",
        role: "SUPER_ADMIN",
        current_organization_id: organizationId,
      };
    else if (url.pathname === "/rest/v1/organization_memberships")
      body = [
        {
          organization_id: organizationId,
          role: "SUPER_ADMIN",
          organizations: {
            id: organizationId,
            name: "Test workspace",
            slug: "test-workspace",
          },
        },
      ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto("/");
  await page.getByLabel("Work email").fill(authUser.email);
  await page.getByLabel("Password", { exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  const navigation = page.getByRole("button", { name: "Open navigation" });
  if (await navigation.isVisible()) await navigation.click();
  await page.getByRole("button", { name: "Employees", exact: true }).click();
  await page.getByRole("button", { name: "Add employee" }).click();
  await page.getByLabel("First name", { exact: true }).fill("Unfinished draft");
});

test("tab focus and token refresh preserve the employee draft", async ({
  page,
}) => {
  // Exercise the real SDK visibility listener, then both repeat auth events.
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await emitAuth(page, "SIGNED_IN");
  await emitAuth(page, "TOKEN_REFRESHED");
  await expect(page).toHaveURL(/\/employees$/);
  await expect(
    page.getByRole("heading", { name: "Register employee" }),
  ).toBeVisible();
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue(
    "Unfinished draft",
  );
});

test("sign-out wins over an in-flight background profile refresh", async ({
  page,
}) => {
  let releaseProfile!: () => void;
  const pending = new Promise<void>((resolve) => {
    releaseProfile = resolve;
  });
  let profileRequested!: () => void;
  const requested = new Promise<void>((resolve) => {
    profileRequested = resolve;
  });
  await page.route("**/rest/v1/users?**", async (route) => {
    profileRequested();
    await pending;
    await route.fulfill({
      json: { full_name: "Session Test", role: "SUPER_ADMIN" },
    });
  });
  await emitAuth(page, "USER_UPDATED");
  await requested;
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue(
    "Unfinished draft",
  );
  await emitAuth(page, "SIGNED_OUT", null);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  releaseProfile();
  await page.waitForTimeout(300);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Register employee" }),
  ).toHaveCount(0);
});

test("a different account does not inherit the employee draft", async ({
  page,
}) => {
  await emitAuth(page, "SIGNED_IN", {
    ...session,
    user: { ...authUser, id: "33333333-3333-4333-8333-333333333333" },
  });
  await expect(
    page.getByRole("heading", { name: "Register employee" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("First name", { exact: true })).toHaveCount(0);
});
