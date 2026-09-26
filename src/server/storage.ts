import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

/**
 * Object storage behind one interface. Rows store (bucket, key); the bytes live
 * on local disk (dev), in Supabase Storage, or — for small shared deployments
 * without object storage — in the database itself (STORAGE_DRIVER=database). Every bucket is private — the browser only reaches files
 * through route handlers that check ownership or staff permissions.
 */
export const BUCKETS = {
  originals: "artwork-originals",
  processed: "artwork-processed",
  previews: "design-previews",
  production: "production-files",
} as const;
export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

export interface StorageDriver {
  put(bucket: Bucket, key: string, data: Buffer, contentType: string): Promise<void>;
  get(bucket: Bucket, key: string): Promise<Buffer | null>;
  delete(bucket: Bucket, key: string): Promise<void>;
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,250}$/;
function assertKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..") || key.includes("//")) throw new Error(`unsafe storage key: ${key}`);
}

export class LocalDiskStorage implements StorageDriver {
  constructor(private root: string) {}
  private file(bucket: Bucket, key: string) {
    assertKey(key);
    const full = path.resolve(this.root, bucket, key);
    if (!full.startsWith(path.resolve(this.root, bucket) + path.sep)) throw new Error("path escape");
    return full;
  }
  async put(bucket: Bucket, key: string, data: Buffer) {
    const f = this.file(bucket, key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, data);
  }
  async get(bucket: Bucket, key: string) {
    try {
      return await fs.readFile(this.file(bucket, key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  async delete(bucket: Bucket, key: string) {
    await fs.rm(this.file(bucket, key), { force: true });
  }
}

/** Supabase Storage via its REST API, authenticated with the server-only service-role key. */
export class SupabaseStorage implements StorageDriver {
  constructor(
    private url: string,
    private serviceKey: string,
  ) {}
  private endpoint(bucket: Bucket, key: string) {
    assertKey(key);
    return `${this.url.replace(/\/$/, "")}/storage/v1/object/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }
  async put(bucket: Bucket, key: string, data: Buffer, contentType: string) {
    const res = await fetch(this.endpoint(bucket, key), {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "x-upsert": "true", "cache-control": "private, max-age=31536000" }),
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`storage put failed (${res.status}): ${await res.text()}`);
  }
  async get(bucket: Bucket, key: string) {
    const res = await fetch(this.endpoint(bucket, key), { headers: this.headers() });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`storage get failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  async delete(bucket: Bucket, key: string) {
    await fetch(this.endpoint(bucket, key), { method: "DELETE", headers: this.headers() });
  }
}

/** Files stored in the shared Postgres database (table storage_objects). */
export class DatabaseStorage implements StorageDriver {
  private async db() {
    const { getRawDb } = await import("./db/client");
    return getRawDb();
  }
  async put(bucket: Bucket, key: string, data: Buffer, contentType: string) {
    assertKey(key);
    const { storageObjects } = await import("./db/schema");
    await (await this.db())
      .insert(storageObjects)
      .values({ bucket, key, contentType, data })
      .onConflictDoUpdate({ target: [storageObjects.bucket, storageObjects.key], set: { data, contentType } });
  }
  async get(bucket: Bucket, key: string) {
    assertKey(key);
    const { storageObjects } = await import("./db/schema");
    const { and, eq } = await import("drizzle-orm");
    const [row] = await (await this.db())
      .select({ data: storageObjects.data })
      .from(storageObjects)
      .where(and(eq(storageObjects.bucket, bucket), eq(storageObjects.key, key)))
      .limit(1);
    return row ? Buffer.from(row.data) : null;
  }
  async delete(bucket: Bucket, key: string) {
    assertKey(key);
    const { storageObjects } = await import("./db/schema");
    const { and, eq } = await import("drizzle-orm");
    await (await this.db()).delete(storageObjects).where(and(eq(storageObjects.bucket, bucket), eq(storageObjects.key, key)));
  }
}

let driver: StorageDriver | undefined;
export function storage(): StorageDriver {
  if (driver) return driver;
  const e = env();
  driver =
    e.STORAGE_DRIVER === "supabase"
      ? new SupabaseStorage(e.SUPABASE_URL!, e.SUPABASE_SERVICE_ROLE_KEY!)
      : e.STORAGE_DRIVER === "database"
        ? new DatabaseStorage()
        : new LocalDiskStorage(path.resolve(e.LOCAL_STORAGE_DIR));
  return driver;
}

/** Tests inject an isolated storage root. */
export function setStorageForTests(d: StorageDriver | undefined) {
  driver = d;
}
