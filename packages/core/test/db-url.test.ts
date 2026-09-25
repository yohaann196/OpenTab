import { isPooledUrl, normalizeUrl } from "@opentab/db";
import { describe, expect, it } from "vitest";

describe("hosted Postgres connection strings", () => {
  it("detects transaction poolers (Supabase :6543, Neon -pooler)", () => {
    expect(
      isPooledUrl("postgresql://postgres.abc:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres"),
    ).toBe(true);
    expect(
      isPooledUrl(
        "postgresql://u:pw@ep-cool-1-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
      ),
    ).toBe(true);
    expect(isPooledUrl("postgresql://u:pw@db.abc.supabase.co:5432/postgres")).toBe(false);
    expect(isPooledUrl("postgres://opentab:opentab@localhost:5432/opentab")).toBe(false);
  });

  it("drops client-only params that postgres.js would send as server settings", () => {
    const url = normalizeUrl(
      "postgresql://u:pw@ep-x-pooler.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    );
    expect(url).toContain("sslmode=require");
    expect(url).not.toContain("channel_binding");
    expect(normalizeUrl("postgres://u:pw@h:6543/db?pgbouncer=true")).not.toContain("pgbouncer");
  });
});
