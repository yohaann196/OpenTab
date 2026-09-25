export const env = {
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  authSecret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-dev-secret-dev-secret-dev",
  smtpUrl: process.env.SMTP_URL ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "OpenTab <no-reply@opentab.local>",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
};
