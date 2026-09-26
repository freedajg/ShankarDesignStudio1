import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once. Missing or inconsistent configuration fails
 * loudly with a message naming the variable, instead of surfacing later as a
 * confusing runtime error. Nothing here is ever sent to the browser.
 */

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),

    DATABASE_URL: z.string().optional(),
    PGLITE_DATA_DIR: z.string().default(".data/pglite"),

    STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
    LOCAL_STORAGE_DIR: z.string().default(".data/storage"),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

    PAYMENT_PROVIDER: z.enum(["dev", "razorpay"]).default("dev"),
    ALLOW_DEV_PAYMENTS: bool,
    DEV_PAYMENT_SECRET: z.string().optional(),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

    EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("Sweet Ginger Design Studio <orders@example.com>"),
    STAFF_NOTIFY_EMAIL: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const need = (cond: boolean, path: string, message: string) => {
      if (!cond) ctx.addIssue({ code: "custom", path: [path], message });
    };
    const prod = env.NODE_ENV === "production";

    if (env.STORAGE_DRIVER === "supabase") {
      need(!!env.SUPABASE_URL, "SUPABASE_URL", "required when STORAGE_DRIVER=supabase");
      need(!!env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY", "required when STORAGE_DRIVER=supabase");
    }
    if (env.PAYMENT_PROVIDER === "razorpay") {
      need(!!env.RAZORPAY_KEY_ID, "RAZORPAY_KEY_ID", "required when PAYMENT_PROVIDER=razorpay");
      need(!!env.RAZORPAY_KEY_SECRET, "RAZORPAY_KEY_SECRET", "required when PAYMENT_PROVIDER=razorpay");
    }
    if (env.EMAIL_PROVIDER === "resend") {
      need(!!env.RESEND_API_KEY, "RESEND_API_KEY", "required when EMAIL_PROVIDER=resend");
    }
    // A deployed shop must not silently run on development stand-ins.
    if (prod && !env.ALLOW_DEV_PAYMENTS) {
      need(env.PAYMENT_PROVIDER !== "dev", "PAYMENT_PROVIDER", "the dev payment provider is refused in production (set ALLOW_DEV_PAYMENTS=true only for a staging demo)");
      need(!!env.DATABASE_URL, "DATABASE_URL", "production needs a real Postgres database (embedded PGlite is for development)");
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\nSee design-studio/.env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = undefined;
}
