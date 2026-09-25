import "server-only";
import { env } from "./env";

/** Sends an email via SMTP when configured; otherwise logs it (dev). */
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!env.smtpUrl) {
    console.info(`\n[email] to=${to}\n[email] subject=${subject}\n${text}\n`);
    return;
  }
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(env.smtpUrl);
  await transport.sendMail({ from: env.emailFrom, to, subject, text });
}
