import Link from "next/link";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-fg-muted">
            Open-source tabulation for speech &amp; debate. Built to stay up on the busiest Saturday
            of the season.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            ["Features", "/features"],
            ["Tournaments", "/tournaments"],
            ["Demo tournament", "/t/opentab-invitational"],
            ["Public API", "/docs#api"],
          ]}
        />
        <FooterCol
          title="Guides"
          links={[
            ["Tab director guide", "/docs"],
            ["For judges", "/docs#judges"],
            ["For competitors", "/docs#competitors"],
            ["Self-hosting", "/docs#self-host"],
          ]}
        />
        <FooterCol
          title="Project"
          links={[
            ["Source code", "https://github.com/yohaann196/opentab"],
            ["License (AGPL-3.0)", "https://www.gnu.org/licenses/agpl-3.0.html"],
            ["Sign in", "/sign-in"],
          ]}
        />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-fg-subtle sm:flex-row sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} OpenTab contributors.</span>
          <span>Not affiliated with the NSDA or Tabroom.com.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="space-y-2 text-sm">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="text-fg-muted transition hover:text-fg">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
