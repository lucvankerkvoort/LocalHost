import { test, expect } from "@playwright/test";

test("test", async ({ page }) => {
  await page.goto("http://localhost:3000/");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("textbox", { name: "name@example.com" }).click();
  await page
    .getByRole("textbox", { name: "name@example.com" })
    .fill("demo@localhost.com");
  await page.getByRole("textbox", { name: "name@example.com" }).press("Tab");
  await page.getByRole("textbox", { name: "••••••••" }).fill("password");
  await page.getByRole("textbox", { name: "••••••••" }).press("Enter");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
});
