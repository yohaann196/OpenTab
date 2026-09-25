import "server-only";
import { account, getDb, session, user, verification } from "@opentab/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { env } from "./env";
import { sendEmail } from "./mailer";
import { withBase } from "./paths";

export const auth = betterAuth({
  appName: "OpenTab",
  // Better Auth treats a baseURL with a path as the full API URL, so pass the
  // origin and the (sub-path aware) API path separately.
  baseURL: new URL(env.appUrl).origin,
  basePath: withBase("/api/auth"),
  secret: env.authSecret,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 300 },
  },
  rateLimit: { enabled: process.env.NODE_ENV === "production", window: 60, max: 30 },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendEmail(
          email,
          "Your OpenTab sign-in link",
          `Sign in to OpenTab:\n\n${url}\n\nThis link expires in 5 minutes.`,
        );
      },
    }),
    nextCookies(),
  ],
});
