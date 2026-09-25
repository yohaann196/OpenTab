import { devices, expect, test } from "@playwright/test";
import { importCsv, signUp, sql, unique, url } from "./helpers";

/**
 * The whole Saturday, end to end: a new tab director creates a tournament,
 * imports data, pairs and publishes round 1, a judge submits a ballot from a
 * phone via their private link, and the public site shows the pairings.
 */
test("create, import, pair, publish, ballot, public", async ({ page, browser }) => {
  const id = unique();
  const slug = `e2e-${id}`;
  await signUp(page, "E2E Director", `director-${id}@example.com`);

  // --- Wizard -------------------------------------------------------------
  await page
    .getByRole("link", { name: /New tournament/ })
    .first()
    .click();
  await page.getByLabel("Tournament name").fill(`E2E Classic ${id}`);
  await page.locator("#slug").fill(slug);
  await expect(page.getByText("Available.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Lincoln–Douglas/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create tournament" }).click();
  await page.waitForURL(`**/tab/${slug}?welcome=1`);
  await expect(page.getByText("Your tournament is ready").first()).toBeVisible();

  // --- Imports ------------------------------------------------------------
  const schools = ["Lincoln High School", "Roosevelt Academy", "Carver Prep", "Hopper Magnet"];
  const debaters = [
    "Ava Nguyen",
    "Liam Patel",
    "Maya Chen",
    "Noah Kim",
    "Zoe Garcia",
    "Ethan Shah",
    "Priya Lee",
    "Lucas Park",
    "Aria Wong",
    "Mateo Cruz",
  ];
  await page.goto(url(`/tab/${slug}/data/entries`));
  await importCsv(
    page,
    ["Event,School,Debater", ...debaters.map((d, i) => `LD,${schools[i % 4]},${d}`)].join("\n"),
    /Imported 10 entries/,
  );
  await expect(page.getByRole("cell", { name: /Ava Nguyen/ }).first()).toBeVisible();

  await page.goto(url(`/tab/${slug}/data/judges`));
  await importCsv(
    page,
    [
      "Name,School,Rounds owed,Rating",
      "Jordan Rivera,,4,8",
      "Sam Ortiz,,4,6",
      "Dana Lee,Lincoln High School,4,7",
      "Chris Moore,Carver Prep,4,5",
      "Alex Kim,,4,5",
      "Robin Chen,,4,4",
    ].join("\n"),
    /Imported 6 judges/,
  );

  await page.goto(url(`/tab/${slug}/data/rooms`));
  await importCsv(
    page,
    [
      "Room,Priority,Accessible",
      "101,10,yes",
      "102,8,no",
      "103,6,no",
      "104,4,no",
      "105,2,yes",
      "106,1,no",
    ].join("\n"),
    /Imported 6 rooms/,
  );

  await page.goto(url(`/tab/${slug}/links`));
  await page.getByRole("button", { name: /Create \d+ missing link/ }).click();
  await expect(page.getByText("Everyone has a link").first()).toBeVisible();

  // --- Pair round 1 ---------------------------------------------------------
  await page.goto(url(`/tab/${slug}`));
  await page.getByRole("link", { name: "Pair round 1", exact: true }).click();
  await page.getByRole("button", { name: /New round/ }).click();
  await page.getByRole("button", { name: "Create & pair" }).click();
  await page.waitForURL(/\/rounds\/[0-9a-f-]+/);
  await expect(page.getByText("No blocking issues").first()).toBeVisible();
  await expect(page.getByText("5 debates").first()).toBeVisible();

  // Why-this-pairing explanation is available.
  await page.getByRole("button", { name: "Why this pairing?" }).first().click();
  await expect(page.getByRole("dialog", { name: "Why this pairing?" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Publish.
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText("published", { exact: true }).first()).toBeVisible();
  const roundId = page.url().split("/rounds/")[1]!.split(/[?#]/)[0]!;

  // --- Judge ballot from a phone ------------------------------------------
  const [row] = await sql<{ token: string; ballot: string }[]>`
    select t.token, b.id as ballot from ballot b
    join pairing p on p.id = b.pairing_id
    join access_token t on t.subject_id = b.judge_id and t.revoked_at is null
    where p.round_id = ${roundId} limit 1`;
  expect(row).toBeTruthy();
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  const judgePage = await phone.newPage();
  await judgePage.goto(url(`/p/${row!.token}`));
  await expect(judgePage.getByText(/Room \d+/).first()).toBeVisible();
  await judgePage.getByRole("button", { name: /I.m in the room/ }).click();
  await expect(judgePage.getByText("Round started").first()).toBeVisible();
  await judgePage.getByRole("link", { name: /Open ballot/ }).click();
  const points = judgePage.getByRole("textbox", { name: /Points for speaker 1/ });
  await points.nth(0).fill("28.5");
  await points.nth(1).fill("29.1");
  await judgePage.getByRole("button", { name: /wins/ }).nth(1).click();
  await judgePage
    .getByLabel("Reason for decision")
    .fill("Neg won the framework debate and the weighing.");
  await judgePage.getByRole("button", { name: "Review & submit" }).click();
  await judgePage.getByRole("button", { name: "Submit ballot" }).click();
  await expect(judgePage.getByText("Ballot submitted").first()).toBeVisible();
  await phone.close();

  // --- Tab ballot board reflects it ----------------------------------------
  await page.getByRole("link", { name: "Ballots" }).click();
  await expect(page.getByText("1/5").first()).toBeVisible();

  // --- Public site ----------------------------------------------------------
  const pub = await browser.newPage();
  await pub.goto(url(`/t/${slug}`));
  await expect(pub.getByRole("heading", { name: "Find your round" })).toBeVisible();
  await pub.getByLabel("Search pairings").fill("Ava");
  await expect(pub.getByText(/Ava/).first()).toBeVisible();
  await pub.goto(url(`/t/${slug}/pairings/${roundId}`));
  await expect(pub.getByRole("heading", { name: /Round 1/ })).toBeVisible();
  await expect(pub.locator("li[id^='d-']")).toHaveCount(5);

  // Public API returns the same snapshot.
  const api = await pub.request.get(url(`/api/v1/public/t/${slug}/rounds/${roundId}`));
  expect(api.ok()).toBe(true);
  expect((await api.json()).debates).toHaveLength(5);
  await pub.close();
});
