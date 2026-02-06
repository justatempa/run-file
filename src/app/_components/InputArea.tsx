"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { uploadLocalFiles } from "~/utils/localUpload";

interface InputAreaProps {
  conversationId: string;
  onSendText: (content: string) => void | Promise<void>;
  onSendFile: (file: {
    type: "IMAGE" | "FILE" | "VIDEO";
    content: string;
    originalName: string;
    mimeType: string;
    size: number;
  }) => void | Promise<void>;
  isSending: boolean;
}

export function InputArea({
  conversationId,
  onSendText,
  onSendFile,
  isSending,
}: InputAreaProps) {
  const [messageText, setMessageText] = useState("");
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxTextareaRows = 5;

  const resizeTextarea = (textarea: HTMLTextAreaElement) => {
    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight || "20");
    const paddingTop = Number.parseFloat(styles.paddingTop || "0");
    const paddingBottom = Number.parseFloat(styles.paddingBottom || "0");
    const maxHeight = lineHeight * maxTextareaRows + paddingTop + paddingBottom;

    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  const uploadAndSendFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploadingFiles(files.map((file) => file.name));
    setIsUploading(true);
    try {
      const uploaded = await uploadLocalFiles(files, { conversationId });
      await Promise.all(
        uploaded.map((file) => {
          const fileType = file.type.startsWith("image/")
            ? "IMAGE"
            : file.type.startsWith("video/")
              ? "VIDEO"
              : "FILE";

          return onSendFile({
            type: fileType,
            content: file.url,
            originalName: file.name,
            mimeType: file.type,
            size: file.size,
          });
        }),
      );
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setUploadingFiles([]);
      setIsUploading(false);
    }
  };

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    void onSendText(messageText);
    setMessageText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    await uploadAndSendFiles(fileArray);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item?.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      await uploadAndSendFiles(files);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    resizeTextarea(e.target);
  };

  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-3 shadow-sm">
      {uploadingFiles.length > 0 && (
        <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Uploading {uploadingFiles.length} file(s)...
          </p>
          <div className="mt-1 space-y-1">
            {uploadingFiles.map((name, idx) => (
              <p key={idx} className="truncate text-xs text-slate-600">
                {name}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
          accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isSending}
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100/70 text-slate-600 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm disabled:opacity-50"
          title="Upload file"
        >
          <svg
            className="h-5 w-5 text-slate-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={messageText}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Type a message or paste an image..."
          className="min-w-0 flex-1 resize-none break-words [overflow-wrap:anywhere] rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-800 shadow-inner focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
          rows={1}
          style={{ overflowY: "hidden" }}
        />

        <button
          onClick={handleSendMessage}
          disabled={!messageText.trim() || isSending || isUploading}
          className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
