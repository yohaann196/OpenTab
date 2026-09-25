// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [dark]
import { chromium } from "@playwright/test";

const [, , url, out, w = "1440", h = "900", dark] = process.argv;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  colorScheme: dark ? "dark" : "light",
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: out, fullPage: process.env.FULL === "1" });
await browser.close();
