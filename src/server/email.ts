import "server-only";
import { env } from "./env";

export type Email = { to: string; subject: string; text: string; html?: string };

export interface EmailProvider {
  send(email: Email): Promise<void>;
}

/** Development: prints emails to the server console. Sends nothing. */
class ConsoleEmail implements EmailProvider {
  async send(email: Email) {
    console.info(`\n[email:dev — not sent] To: ${email.to}\nSubject: ${email.subject}\n${email.text}\n`);
  }
}

class ResendEmail implements EmailProvider {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}
  async send(email: Email) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    });
    if (!res.ok) throw new Error(`Resend failed (${res.status}): ${await res.text()}`);
  }
}

let provider: EmailProvider | undefined;
export function emailProvider(): EmailProvider {
  if (provider) return provider;
  const e = env();
  provider = e.EMAIL_PROVIDER === "resend" ? new ResendEmail(e.RESEND_API_KEY!, e.EMAIL_FROM) : new ConsoleEmail();
  return provider;
}

export function setEmailProviderForTests(p: EmailProvider | undefined) {
  provider = p;
}

/** Email must never break an order: failures are logged, not thrown. */
export async function sendSafely(email: Email) {
  try {
    await emailProvider().send(email);
  } catch (err) {
    console.error("[email] failed to send", email.subject, err);
  }
}
