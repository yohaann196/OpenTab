import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
for (const [path, scheme] of [
  ["/", "light"],
  ["/", "dark"],
  ["/docs", "light"],
  ["/sign-in", "light"],
  ["/tournaments", "light"],
  ["/features", "light"],
]) {
  const ctx = await browser.newContext({ colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const r = await new AxeBuilder({ page })
    .withRules(["color-contrast", "link-in-text-block"])
    .analyze();
  const seen = new Set();
  for (const v of r.violations)
    for (const n of v.nodes) {
      const key = `${v.id} ${n.any?.[0]?.message?.slice(0, 140)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(path, scheme, v.id, n.target.join(" "), "|", n.any?.[0]?.message?.slice(0, 160));
    }
  await ctx.close();
}
await browser.close();
