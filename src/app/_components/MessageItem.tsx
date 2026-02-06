"use client";

import { useRef, useState } from "react";
import Image from "next/image";

type MessageType = "TEXT" | "IMAGE" | "FILE" | "VIDEO";

interface Message {
  id: string;
  type: MessageType;
  content: string;
  originalName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  createdAt: Date;
  status?: "sending" | "failed";
  errorMessage?: string;
  isDeleted: boolean;
  conversationId: string;
}

interface MessageItemProps {
  message: Message;
  timestampLabel?: string | null;
  onDelete?: (id: string) => void;
  onRetry?: (message: Message) => void;
  isSelectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function MessageItem({
  message,
  timestampLabel,
  onDelete,
  onRetry,
  isSelectable = false,
  isSelected = false,
  onToggleSelect,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef(0);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleCopyText = async () => {
    if (message.type !== "TEXT") return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.content);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = message.content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  const canDelete = !message.status && !isSelectable && !!onDelete;
  const canCopy = !message.status && !isSelectable && message.type === "TEXT";

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerDown = () => {
    if (!canDelete) return;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      lastTapRef.current = 0;
      onDelete?.(message.id);
    }, 450);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    clearLongPress();
    if (!canCopy || event.pointerType !== "touch") return;
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      void handleCopyText();
    } else {
      lastTapRef.current = now;
    }
  };

  const handlePointerLeave = () => {
    clearLongPress();
  };

  const handlePointerCancel = () => {
    clearLongPress();
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canCopy) return;
    if (event.detail === 2) {
      void handleCopyText();
    }
  };

  const renderContent = () => {
    switch (message.type) {
      case "TEXT":
        return (
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[13px] leading-relaxed text-slate-800">
            {message.content}
          </span>
        );

      case "IMAGE":
        return (
          <div className="space-y-2">
            <div className="relative h-56 w-full overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
              <Image
                src={message.content}
                alt={message.originalName || "Image"}
                fill
                className="object-contain"
                unoptimized
              />
            </div>
            {message.originalName && (
              <p className="truncate text-xs text-slate-500" title={message.originalName}>{message.originalName}</p>
            )}
          </div>
        );

      case "VIDEO":
        return (
          <div className="space-y-2">
            <video
              src={message.content}
              controls
              className="w-full max-h-80 rounded-2xl border border-slate-200/70 bg-black/80"
            >
              Your browser does not support the video tag.
            </video>
            {message.originalName && (
              <p className="truncate text-xs text-slate-500" title={message.originalName}>{message.originalName}</p>
            )}
          </div>
        );

      case "FILE":
        return (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-slate-50 p-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white">
              <svg
                className="h-6 w-6 text-slate-900"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {message.originalName || "File"}
              </p>
              {message.size && (
                <p className="text-xs text-slate-500">
                  {formatFileSize(message.size)}
                </p>
              )}
            </div>
            <a
              href={message.content}
              download={message.originalName || "file"}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Download
            </a>
          </div>
        );

      default:
        return <p className="break-words [overflow-wrap:anywhere] text-slate-800">{message.content}</p>;
    }
  };

  const statusLabel =
    message.status === "sending"
      ? "Sending..."
      : message.status === "failed"
        ? "Failed to send"
        : null;
  const displayLabel = statusLabel ?? timestampLabel;

  return (
    <div className="group flex w-full flex-col items-center">
      {displayLabel && (
        <div className="mb-1 text-[11px] text-slate-400">{displayLabel}</div>
      )}
      <div className="relative flex w-full max-w-[90%] items-start gap-2 sm:max-w-[75%]">
        {isSelectable && (
          <button
            onClick={() => onToggleSelect?.(message.id)}
            aria-pressed={isSelected}
            aria-label={isSelected ? "Deselect message" : "Select message"}
            className={`mt-3 flex h-5 w-5 items-center justify-center rounded border text-[10px] font-semibold ${
              isSelected
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-400"
            }`}
          >
            {isSelected && (
              <svg viewBox="0 0 20 20" className="h-3 w-3 fill-current">
                <path d="M7.667 13.333 4.333 10l-1.333 1.333L7.667 16 17 6.667l-1.333-1.334z" />
              </svg>
            )}
          </button>
        )}
        <div
          className={`relative min-w-0 flex-1 rounded-3xl border border-slate-200/70 bg-white/90 p-3 shadow-sm ${
            isSelected ? "ring-2 ring-slate-900/10" : ""
          }`}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerCancel}
          onClick={handleClick}
        >
          {renderContent()}
          {message.status === "failed" && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-red-600">
              <span title={message.errorMessage ?? "Failed to send"}>Failed to send</span>
              {onRetry && (
                <button
                  onClick={() => onRetry(message)}
                  className="rounded-full border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-50"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {copied && (
            <div className="pointer-events-none absolute right-3 top-2 rounded-full bg-slate-900/90 px-2 py-0.5 text-[10px] font-semibold text-white">
              Copied
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

