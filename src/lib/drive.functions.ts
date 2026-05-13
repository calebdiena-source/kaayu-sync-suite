import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uploadToDrive, downloadFromDrive, deleteFromDrive } from "./google-drive.server";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export const driveAvailable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("google_integrations")
      .select("scope")
      .eq("user_id", context.userId)
      .maybeSingle();
    const ok = !!data?.scope?.includes("drive.file");
    return { available: ok };
  });

export const uploadDocumentToDrive = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { name: string; mimeType: string; dataB64: string; folderId?: string | null }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const bytes = b64ToBytes(data.dataB64);
    const result = await uploadToDrive(
      context.userId,
      data.name,
      data.mimeType || "application/octet-stream",
      bytes,
    );
    if (!result) throw new Error("Google Drive non connecté");
    const { data: doc, error } = await supabaseAdmin
      .from("documents")
      .insert({
        user_id: context.userId,
        name: data.name,
        storage_path: `drive:${result.id}`,
        storage_provider: "drive",
        google_file_id: result.id,
        mime_type: data.mimeType,
        size_bytes: result.size,
        folder_id: data.folderId ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: doc.id };
  });

export const downloadDocumentFromDrive = createServerFn({ method: "POST" })
  .inputValidator((d: { documentId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("google_file_id, mime_type, name, user_id")
      .eq("id", data.documentId)
      .maybeSingle();
    if (!doc || doc.user_id !== context.userId) throw new Error("Introuvable");
    if (!doc.google_file_id) throw new Error("Pas un fichier Drive");
    const r = await downloadFromDrive(context.userId, doc.google_file_id);
    if (!r) throw new Error("Échec téléchargement Drive");
    return {
      name: doc.name,
      mimeType: doc.mime_type ?? r.mimeType,
      dataB64: bytesToB64(r.bytes),
    };
  });

export const deleteDocumentFromDrive = createServerFn({ method: "POST" })
  .inputValidator((d: { fileId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await deleteFromDrive(context.userId, data.fileId);
    return { ok: true };
  });
