import type { Page } from "@playwright/test";
import postgres from "postgres";

export const sql = postgres(
  process.env.DATABASE_URL ?? "postgres://opentab:opentab@localhost:5432/opentab",
  { max: 2, idle_timeout: 2, onnotice: () => {} },
);

export const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function signUp(
  page: Page,
  name: string,
  email: string,
  password = "correct-horse-battery",
) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/tab");
}

/** Pastes CSV text into the import dialog on a data page and commits it. */
export async function importCsv(page: Page, csv: string, expected: RegExp) {
  await page.getByRole("button", { name: "Import CSV" }).click();
  await page.getByLabel("CSV text").fill(csv);
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: /^Import \d+/ }).click();
  await page.getByText(expected).first().waitFor();
}
