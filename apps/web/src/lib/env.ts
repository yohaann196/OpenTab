const authSecret = process.env.BETTER_AUTH_SECRET;
if (!authSecret && process.env.VERCEL_ENV === "production") {
  throw new Error("BETTER_AUTH_SECRET must be set in production (see docs/deploy-vercel.md).");
}

const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}${process.env.BASE_PATH ?? ""}`
  : undefined;

export const env = {
  /** Public URL of the app, including any sub-path (e.g. https://yohaan.tech/opentab). */
  appUrl: (process.env.APP_URL ?? vercelUrl ?? "http://localhost:3000").replace(/\/$/, ""),
  authSecret: authSecret ?? "dev-secret-dev-secret-dev-secret-dev",
  smtpUrl: process.env.SMTP_URL ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "OpenTab <no-reply@opentab.local>",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
};
