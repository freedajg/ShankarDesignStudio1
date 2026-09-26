import { api, json } from "@/server/http";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { ensureOwner } from "@/server/owner";
import { processUpload } from "@/server/services/artwork";
import { loadSettings } from "@/server/services/catalogue";
import { enforce } from "@/server/services/rate-limit";
import { requestMeta } from "@/server/auth/session";

/** POST multipart/form-data { file } → validated, stored artwork. */
export const POST = api(async (req) => {
  const db = await getDb();
  const owner = await ensureOwner();
  const { ip } = await requestMeta();
  await enforce(db, `upload:owner:${owner.tokenHash}`, 40, 10 * 60, "You've uploaded a lot of files in a short time. Please wait a few minutes.");
  await enforce(db, `upload:ip:${ip ?? "unknown"}`, 120, 10 * 60, "Too many uploads from your network. Please wait a few minutes.");

  const settings = await loadSettings(db);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > settings.artwork.maxUploadBytes + 64 * 1024) {
    throw new AppError("VALIDATION", `That file is too large. The limit is ${Math.round(settings.artwork.maxUploadBytes / 1024 / 1024)} MB.`);
  }
  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    throw new AppError("VALIDATION", "Your image couldn't be uploaded. Please try again.");
  }
  if (!(file instanceof File)) throw new AppError("VALIDATION", "Choose an image to upload.");

  const asset = await processUpload(db, {
    data: Buffer.from(await file.arrayBuffer()),
    filename: file.name || null,
    ownerTokenHash: owner.tokenHash,
    rules: settings.artwork,
  });
  return json({ asset }, { status: 201 });
});
