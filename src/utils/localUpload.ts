export type LocalUploadedFile = {
  url: string;
  name: string;
  type: string;
  size: number;
};

export async function uploadLocalFiles(
  files: File[],
  options?: { conversationId?: string | null },
): Promise<LocalUploadedFile[]> {
  if (!files.length) return [];

  const formData = new FormData();
  if (options?.conversationId) {
    formData.append("conversationId", options.conversationId);
  }
  files.forEach((file) => {
    formData.append("files", file, file.name);
  });

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Upload failed");
  }

  const data = (await response.json()) as { files: LocalUploadedFile[] };
  return data.files ?? [];
}
