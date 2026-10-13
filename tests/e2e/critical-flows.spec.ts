import { expect,test,type Page } from "@playwright/test";

async function signIn(page:Page,email="admin@peopleflow.io") {
  await page.goto("/");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button",{name:/sign in/i}).click();
  await expect(page.getByText("Brunovia",{exact:true}).first()).toBeVisible();
}
async function openNavigation(page:Page) {
  const button=page.getByRole("button",{name:"Open navigation"});
  if(await button.isVisible())await button.click();
}

test("administrator can reach enterprise workspaces with routable URLs",async({page})=>{
  await signIn(page);
  await openNavigation(page);
  await page.getByRole("button",{name:"Employees",exact:true}).click();
  await expect(page).toHaveURL(/\/employees$/);
  await expect(page.getByRole("heading",{name:/employee/i}).first()).toBeVisible();
  await openNavigation(page);
  await page.getByRole("button",{name:"Compliance",exact:true}).click();
  await expect(page).toHaveURL(/\/compliance$/);
  await expect(page.getByRole("heading",{name:"Compliance & observability"})).toBeVisible();
});
test("employee navigation does not expose privileged modules",async({page})=>{
  await signIn(page,"employee@peopleflow.io");
  await openNavigation(page);
  await expect(page.getByRole("button",{name:"Payroll",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Compliance",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Automation",exact:true})).toHaveCount(0);
});
test("health endpoint stays cache-free",async({request})=>{
  const response=await request.get("/api/health/live");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect((await response.json()).status).toBe("ok");
});
