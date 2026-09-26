import "server-only";
import { z } from "zod";
import { siteUrl } from "@/lib/site-url";

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
    /**
     * Demo mode: embedded database + local files, auto-filled with sample data,
     * simulated payments. On by default in production when no DATABASE_URL is set,
     * so a fresh deployment is immediately presentable. Data is not durable.
     */
    DEMO_MODE: bool,
    APP_URL: z.string().url().default(() => siteUrl().origin),

    DATABASE_URL: z.string().optional(),
    // Serverless hosts (Vercel) only allow writing to /tmp.
    PGLITE_DATA_DIR: z.string().default(() => (process.env.VERCEL ? "/tmp/sg-demo/pglite" : ".data/pglite")),

    STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
    LOCAL_STORAGE_DIR: z.string().default(() => (process.env.VERCEL ? "/tmp/sg-demo/storage" : ".data/storage")),
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

    // AI design generation (docs/AI_DESIGN_GENERATION.md). Keys are server-only.
    AI_IMAGE_PROVIDER: z.enum(["auto", "openai", "gemini", "fixture", "off"]).default("auto"),
    AI_FALLBACK_PROVIDER: z.enum(["auto", "openai", "gemini", "none"]).default("auto"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2.5-flare"),
    AI_IMAGE_QUALITY: z.enum(["low", "medium", "high", "auto"]).default("medium"),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_IMAGE_MODEL: z.string().default("gemini-3.1-flash-image"),
    /** variations per generation */
    AI_VARIATIONS: z.coerce.number().int().min(1).max(4).default(3),
    /** generations allowed per browser session (owner cookie) */
    AI_MAX_GENERATIONS_PER_SESSION: z.coerce.number().int().min(0).max(1000).default(10),
    AI_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(290_000).default(170_000),
    AI_ALLOW_FIXTURE: bool,
    AI_FIXTURE_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(0),
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
    if (env.AI_IMAGE_PROVIDER === "openai") need(!!env.OPENAI_API_KEY, "OPENAI_API_KEY", "required when AI_IMAGE_PROVIDER=openai");
    if (env.AI_IMAGE_PROVIDER === "gemini") need(!!env.GEMINI_API_KEY, "GEMINI_API_KEY", "required when AI_IMAGE_PROVIDER=gemini");
    if (env.EMAIL_PROVIDER === "resend") {
      need(!!env.RESEND_API_KEY, "RESEND_API_KEY", "required when EMAIL_PROVIDER=resend");
    }
    // A deployed shop must not silently run on development stand-ins — unless it is
    // an explicit, clearly-labelled demo.
    if (prod && !env.ALLOW_DEV_PAYMENTS && !isDemo(env)) {
      need(env.PAYMENT_PROVIDER !== "dev", "PAYMENT_PROVIDER", "the dev payment provider is refused in production (set ALLOW_DEV_PAYMENTS=true only for a staging demo)");
      need(!!env.DATABASE_URL, "DATABASE_URL", "production needs a real Postgres database (embedded PGlite is for development)");
    }
  })
  .transform((env) => ({ ...env, DEMO_MODE: isDemo(env) }));

function isDemo(env: { DEMO_MODE: boolean; NODE_ENV: string; DATABASE_URL?: string }) {
  return env.DEMO_MODE || (env.NODE_ENV === "production" && !env.DATABASE_URL);
}

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  // Hosting dashboards make it easy to save a variable with an empty value;
  // treat blank values as "not set" so defaults apply instead of failing validation.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = undefined;
}
