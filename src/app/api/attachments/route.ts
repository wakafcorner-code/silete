import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { createAttachment } from "@/services/attachment-service";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const formData = await req.formData();
    const file = formData.get("file");
    const referenceType = String(formData.get("reference_type") ?? "");
    const referenceId = Number(formData.get("reference_id"));

    if (!(file instanceof File) || !referenceType || !Number.isInteger(referenceId) || referenceId <= 0) {
      return NextResponse.json({ success: false, error: "File dan referensi dokumen wajib diisi." }, { status: 422 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: "Format bukti harus JPG, PNG, WEBP, atau PDF." }, { status: 422 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: "Ukuran file maksimal 25MB." }, { status: 422 });
    }

    const extension = path.extname(file.name).toLowerCase() || (file.type === "application/pdf" ? ".pdf" : ".bin");
    const fileName = `${randomUUID()}${extension}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));

    const attachmentId = await createAttachment(session, {
      reference_type: referenceType,
      reference_id: referenceId,
      file_name: file.name,
      file_path: `/uploads/${fileName}`,
      mime_type: file.type,
      file_size: file.size,
    });

    return NextResponse.json({ success: true, attachment_id: attachmentId, file_path: `/uploads/${fileName}` }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal mengunggah bukti transaksi.";
    return NextResponse.json({ success: false, error: message }, { status: message.includes("Unauthorized") || message.includes("Forbidden") ? 403 : 400 });
  }
}