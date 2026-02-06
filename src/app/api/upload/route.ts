import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";

const uploadDir = path.join(process.cwd(), "public", "uploads");

function safeSegment(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "");
  return sanitized.length ? sanitized : "general";
}

function safeName(name: string) {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length ? base : "file";
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const conversationIdRaw = formData.get("conversationId");
  const conversationId =
    typeof conversationIdRaw === "string"
      ? safeSegment(conversationIdRaw)
      : "general";
  const files = formData
    .getAll("files")
    .filter((file): file is File => file instanceof File);

  if (!files.length) {
    return NextResponse.json({ error: "No files provided." }, { status: 400 });
  }

  const conversationDir = path.join(uploadDir, conversationId);
  await fs.mkdir(conversationDir, { recursive: true });

  const uploaded = [] as Array<{
    url: string;
    name: string;
    type: string;
    size: number;
  }>;

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const originalName = safeName(file.name);
    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext) || "file";
    const filename = `${base}-${crypto.randomUUID()}${ext}`;
    const fullPath = path.join(conversationDir, filename);

    await fs.writeFile(fullPath, buffer);

    uploaded.push({
      url: `/uploads/${conversationId}/${filename}`,
      name: file.name,
      type: file.type,
      size: file.size,
    });
  }

  return NextResponse.json({ files: uploaded });
}
