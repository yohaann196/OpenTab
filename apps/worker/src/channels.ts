import type { PlannedMessage } from "@opentab/core";
import nodemailer from "nodemailer";
import webpush from "web-push";

/**
 * Delivery channels. Web Push (VAPID) and SMTP email — no carrier SMS
 * gateways, which the major US carriers have shut down.
 */

const smtpUrl = process.env.SMTP_URL ?? "";
const from = process.env.EMAIL_FROM ?? "OpenTab <no-reply@opentab.local>";
const transport = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;

const vapidPublic = process.env.VAPID_PUBLIC_KEY ?? "";
const vapidPrivate = process.env.VAPID_PRIVATE_KEY ?? "";
if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@opentab.local",
    vapidPublic,
    vapidPrivate,
  );
}

export type SendOutcome = "sent" | "failed" | "gone";

export async function deliver(
  m: PlannedMessage,
  appUrl: string,
): Promise<{ outcome: SendOutcome; error?: string }> {
  try {
    if (m.channel === "email") {
      const text = `${m.body}\n\n${m.url}\n\n—\nOpenTab · ${appUrl}`;
      if (!transport) {
        console.info(`[email] to=${m.endpoint} subject="${m.subject}"\n${text}`);
      } else {
        await transport.sendMail({ from, to: m.endpoint, subject: m.subject, text });
      }
      return { outcome: "sent" };
    }
    if (!vapidPublic || !m.keys) return { outcome: "failed", error: "push not configured" };
    await webpush.sendNotification(
      { endpoint: m.endpoint, keys: m.keys },
      JSON.stringify({ title: m.subject, body: m.body, url: m.url, tag: m.subject }),
      { TTL: 60 * 60, urgency: "high" },
    );
    return { outcome: "sent" };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404/410: the browser unsubscribed — clean up.
    if (status === 404 || status === 410) return { outcome: "gone", error: `HTTP ${status}` };
    return { outcome: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
