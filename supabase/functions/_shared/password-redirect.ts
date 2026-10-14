export function passwordSetupUrl(appUrl = "https://www.brunovia.xyz") {
  // Invitations must always land on the employee password form, even when
  // APP_URL includes a dashboard path or is just the site's origin.
  return new URL("/?setup=password", appUrl).toString();
}
