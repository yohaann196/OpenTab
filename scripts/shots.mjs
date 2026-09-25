// Usage: node scripts/shots.mjs <outdir> <width> <path1> [path2 ...]   (LOGIN=1 signs in as the demo user, DARK=1)
import { chromium } from "@playwright/test";

const [, , outdir, width, ...paths] = process.argv;
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext({
  viewport: { width: Number(width), height: Number(process.env.HEIGHT ?? 900) },
  colorScheme: process.env.DARK ? "dark" : "light",
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text()));
if (process.env.LOGIN) {
  await page.goto(`${base}/sign-in`);
  await page.fill("#email", "demo@opentab.dev");
  await page.fill("#password", "opentab-demo");
  await page.click("button[type=submit]");
  await page.waitForURL("**/tab**", { timeout: 60000 });
}
for (const [i, p] of paths.entries()) {
  const res = await page.goto(`${base}${p}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(800);
  const name = `${outdir}/${String(i).padStart(2, "0")}-${p.replace(/[^a-z0-9]+/gi, "_").slice(0, 60)}${process.env.DARK ? "-dark" : ""}.png`;
  await page.screenshot({ path: name, fullPage: process.env.FULL === "1" });
  console.log(res?.status(), name);
}
await browser.close();
