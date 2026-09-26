import { z } from "zod";

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

const trimmed = (max: number) => z.string().trim().max(max);

/** 10-digit Indian mobile, optionally prefixed with +91 / 0 — normalised to +91XXXXXXXXXX. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .refine((v) => /^(\+91|0)?[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number")
  .transform((v) => `+91${v.slice(-10)}`);

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const checkoutSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    name: trimmed(100).min(2, "Enter your name"),
    email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
    phone: phoneSchema,
    addressLine1: trimmed(200).min(3, "Enter your address"),
    addressLine2: trimmed(200).optional().default(""),
    city: trimmed(100).min(2, "Enter your city"),
    state: z.enum(INDIAN_STATES, { error: "Choose your state" }),
    pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),
    companyName: trimmed(150).optional().default(""),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .default("")
      .refine((v) => v === "" || GSTIN_RE.test(v), "Enter a valid 15-character GSTIN, or leave it blank"),
    poReference: trimmed(80).optional().default(""),
    notes: trimmed(1000).optional().default(""),
  });

export type CheckoutInput = z.input<typeof checkoutSchema>;
export type CheckoutData = z.output<typeof checkoutSchema>;
