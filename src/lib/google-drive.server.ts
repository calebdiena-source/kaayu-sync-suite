// Server-only Google Drive helpers (file upload/download/delete).
// Uses the drive.file scope: only files created by this app are accessible.
import { getValidAccessToken } from "./google-calendar.server";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_NAME = "Kaayu";

async function getAccessToken(userId: string): Promise<string | null> {
  const auth = await getValidAccessToken(userId);
  return auth?.token ?? null;
}

async function ensureKaayuFolder(token: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const search = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)&spaces=drive`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (search.ok) {
    const j = await search.json();
    if (j.files?.[0]?.id) return j.files[0].id as string;
  }
  const create = await fetch(`${DRIVE_API}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!create.ok) throw new Error(`Drive folder create failed: ${await create.text()}`);
  const j = await create.json();
  return j.id as string;
}

export async function uploadToDrive(
  userId: string,
  name: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<{ id: string; size: number } | null> {
  const token = await getAccessToken(userId);
  if (!token) return null;
  const folderId = await ensureKaayuFolder(token);
  const metadata = { name, parents: [folderId], mimeType };
  const boundary = `kaayu_${crypto.randomUUID()}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,size`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${await res.text()}`);
  const j = await res.json();
  return { id: j.id as string, size: Number(j.size ?? bytes.length) };
}

export async function downloadFromDrive(
  userId: string,
  fileId: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const token = await getAccessToken(userId);
  if (!token) return null;
  const meta = await fetch(`${DRIVE_API}/files/${fileId}?fields=mimeType`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meta.ok) throw new Error(`Drive meta failed: ${await meta.text()}`);
  const m = await meta.json();
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive download failed: ${await res.text()}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return { bytes: buf, mimeType: m.mimeType as string };
}

export async function deleteFromDrive(userId: string, fileId: string): Promise<void> {
  const token = await getAccessToken(userId);
  if (!token) return;
  await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
