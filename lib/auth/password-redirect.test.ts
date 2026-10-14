import { describe, expect, it } from "vitest";
import { passwordSetupUrl } from "../../supabase/functions/_shared/password-redirect";

describe("password email destination", () => {
  it("defaults to the public production password form", () => {
    expect(passwordSetupUrl()).toBe("https://www.brunovia.xyz/?setup=password");
  });
  it.each([
    "https://www.brunovia.xyz",
    "https://www.brunovia.xyz/",
    "https://www.brunovia.xyz/super-admin?view=employees#dashboard",
  ])("preserves password setup for APP_URL %s", (appUrl) => {
    expect(passwordSetupUrl(appUrl)).toBe(
      "https://www.brunovia.xyz/?setup=password",
    );
  });
});
