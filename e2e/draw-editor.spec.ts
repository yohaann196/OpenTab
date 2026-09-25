import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { sql, url } from "./helpers";

/** Uses the seeded demo tournament (pnpm db:seed). */
test.describe("demo tournament", () => {
  test.beforeAll(async () => {
    const [t] = await sql`select id from tournament where slug = 'opentab-invitational'`;
    test.skip(!t, "Demo tournament not seeded");
  });

  test("draw editor: click-to-swap, history and undo", async ({ page }) => {
    await page.goto(url("/sign-in"));
    await page.getByLabel("Email").fill("demo@opentab.dev");
    await page.getByLabel("Password").fill("opentab-demo");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/tab");

    const [r] = await sql<{ event_id: string; id: string }[]>`
      select r.event_id, r.id from round r join event e on e.id = r.event_id
      where e.abbreviation = 'CX' and r.status = 'draft' order by r.seq desc limit 1`;
    await page.goto(url(`/tab/opentab-invitational/events/${r!.event_id}/rounds/${r!.id}`));
    await expect(page.getByRole("heading", { name: /Round/ })).toBeVisible();

    const chips = page.locator("section[aria-label='Draw'] li button[title]");
    const first = (await chips.nth(0).getAttribute("title"))!.split(" · ")[0]!;
    const third = (await chips.nth(2).getAttribute("title"))!.split(" · ")[0]!;
    await chips.nth(0).click();
    await expect(page.getByText(/Click another entry to swap/)).toBeVisible();
    await chips.nth(2).click();
    await expect(page.getByText("Swapped").first()).toBeVisible();
    // After the swap, the first debate now contains the third entry.
    await expect(chips.nth(0)).toHaveAttribute(
      "title",
      new RegExp(`^${third.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );

    await page.getByRole("tab", { name: "History" }).click();
    const undo = page.getByRole("button", { name: "Undo" }).first();
    await undo.focus();
    await undo.click();
    await expect(page.getByText("Change undone").first()).toBeVisible();
    await expect(chips.nth(0)).toHaveAttribute(
      "title",
      new RegExp(`^${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
  });

  test("public pages are accessible", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const [r] = await sql<
      { id: string }[]
    >`select r.id from round r join event e on e.id = r.event_id where e.abbreviation = 'LD' and r.status <> 'draft' order by r.seq desc limit 1`;
    for (const path of [
      "/t/opentab-invitational",
      `/t/opentab-invitational/pairings/${r!.id}`,
      "/t/opentab-invitational/judges",
    ]) {
      await page.goto(url(path));
      await page.waitForLoadState("networkidle");
      const res = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      const serious = res.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        serious.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
      ).toEqual([]);
    }
    await ctx.close();
  });

  test("public demo pages and live connection", async ({ page }) => {
    await page.goto(url("/t/opentab-invitational"));
    await expect(page.getByText("Live", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await page
      .getByRole("navigation", { name: "Tournament" })
      .getByRole("link", { name: "Results" })
      .click();
    await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
    await expect(page.getByRole("table").first()).toBeVisible();
    await page
      .getByRole("navigation", { name: "Tournament" })
      .getByRole("link", { name: "Judges" })
      .click();
    await page.getByLabel("Search names or paradigm text").fill("weigh");
    await expect(page.getByText(/weigh/i).first()).toBeVisible();
  });
});
