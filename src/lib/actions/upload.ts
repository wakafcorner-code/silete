"use server";

import { getServerSession } from "@/services/session-service";
import { createAttachment } from "@/services/attachment-service";
import { writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";

/**
 * Server Action for simple file upload documentation.
 * Stores files in public/uploads and records metadata in attachments table.
 */
export async function uploadDocumentationAction(formData: FormData) {
  const session = await getServerSession();
  if (!session) {
    return { success: false, error: "Sesi tidak valid atau telah berakhir." };
  }

  const file = formData.get("file") as File;
  const category = formData.get("category") as string;
  const notes = formData.get("notes") as string;
  const companyId = formData.get("companyId") ? Number(formData.get("companyId")) : null;

  if (!file || file.size === 0) {
    return { success: false, error: "Tidak ada file yang dipilih." };
  }

  // Max 10MB limit (Adjusted from 5MB plan for more flexibility, still below 25MB service limit)
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "File terlalu besar. Maksimal 10MB." };
  }

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create a sanitized unique filename
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
    const filename = `${timestamp}-${safeName}`;

    // Ensure absolute path for fs.writeFile
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    const filePath = path.join(uploadDir, filename);

    // Write file to disk
    await writeFile(filePath, buffer);

    const relativePath = `/uploads/${filename}`;

    // Create attachment record
    // reference_type: "GENERAL_DOC" indicates it's standalone documentation
    // reference_id: 0 or null
    await createAttachment(session, {
      reference_type: "GENERAL_DOC",
      reference_id: 0,
      category: category || "General",
      notes: notes || null,
      file_name: file.name,
      file_path: relativePath,
      mime_type: file.type,
      file_size: file.size,
    }, companyId);

    revalidatePath("/documentation");
    return { success: true, path: relativePath };
  } catch (error: any) {
    console.error("Upload error:", error);
    return { success: false, error: error.message || "Gagal mengunggah file." };
  }
}
