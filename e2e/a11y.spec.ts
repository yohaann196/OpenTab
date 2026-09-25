import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { url } from "./helpers";

test.use({ reducedMotion: "reduce" });

const PAGES = ["/", "/features", "/docs", "/tournaments", "/sign-in", "/sign-up"];

for (const path of PAGES) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(url(path));
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  });
}

test("dark mode renders without contrast failures on the landing page", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto(url("/"));
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious")
      .map((v) => v.nodes.map((n) => n.target).join(",")),
  ).toEqual([]);
  await ctx.close();
});
