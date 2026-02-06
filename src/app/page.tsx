"use client";

import { signOut } from "next-auth/react";
import { api, type RouterOutputs } from "~/trpc/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageItem } from "~/app/_components/MessageItem";
import { InputArea } from "~/app/_components/InputArea";
import { DropZone } from "~/app/_components/DropZone";
import { uploadLocalFiles } from "~/utils/localUpload";

type Message = RouterOutputs["message"]["listByConversation"][number] & {
  status?: "sending" | "failed";
  errorMessage?: string;
};
type OptimisticMessage = Message & {
  status: "sending" | "failed";
};
type ConfirmDialogState = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
};

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0;
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const concatBytes = (chunks: Uint8Array[]) => {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
};

const writeUint16 = (buffer: Uint8Array, offset: number, value: number) => {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  return offset + 2;
};

const writeUint32 = (buffer: Uint8Array, offset: number, value: number) => {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
  return offset + 4;
};

const createZip = (entries: ZipEntry[]) => {
  const encoder = new TextEncoder();
  const files: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const checksum = crc32(data);

    const localHeader = new Uint8Array(30);
    let pointer = 0;
    pointer = writeUint32(localHeader, pointer, 0x04034b50);
    pointer = writeUint16(localHeader, pointer, 20);
    pointer = writeUint16(localHeader, pointer, 0x0800);
    pointer = writeUint16(localHeader, pointer, 0);
    pointer = writeUint16(localHeader, pointer, 0);
    pointer = writeUint16(localHeader, pointer, 0);
    pointer = writeUint32(localHeader, pointer, checksum);
    pointer = writeUint32(localHeader, pointer, data.length);
    pointer = writeUint32(localHeader, pointer, data.length);
    pointer = writeUint16(localHeader, pointer, nameBytes.length);
    pointer = writeUint16(localHeader, pointer, 0);

    files.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array(46);
    pointer = 0;
    pointer = writeUint32(centralHeader, pointer, 0x02014b50);
    pointer = writeUint16(centralHeader, pointer, 20);
    pointer = writeUint16(centralHeader, pointer, 20);
    pointer = writeUint16(centralHeader, pointer, 0x0800);
    pointer = writeUint16(centralHeader, pointer, 0);
    pointer = writeUint16(centralHeader, pointer, 0);
    pointer = writeUint16(centralHeader, pointer, 0);
    pointer = writeUint32(centralHeader, pointer, checksum);
    pointer = writeUint32(centralHeader, pointer, data.length);
    pointer = writeUint32(centralHeader, pointer, data.length);
    pointer = writeUint16(centralHeader, pointer, nameBytes.length);
    pointer = writeUint16(centralHeader, pointer, 0);
    pointer = writeUint16(centralHeader, pointer, 0);
    pointer = writeUint16(centralHeader, pointer, 0);
    pointer = writeUint16(centralHeader, pointer, 0);
    pointer = writeUint32(centralHeader, pointer, 0);
    pointer = writeUint32(centralHeader, pointer, offset);

    centralDirectory.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralData = concatBytes(centralDirectory);
  const centralOffset = offset;

  const endOfCentral = new Uint8Array(22);
  let pointer = 0;
  pointer = writeUint32(endOfCentral, pointer, 0x06054b50);
  pointer = writeUint16(endOfCentral, pointer, 0);
  pointer = writeUint16(endOfCentral, pointer, 0);
  pointer = writeUint16(endOfCentral, pointer, entries.length);
  pointer = writeUint16(endOfCentral, pointer, entries.length);
  pointer = writeUint32(endOfCentral, pointer, centralData.length);
  pointer = writeUint32(endOfCentral, pointer, centralOffset);
  writeUint16(endOfCentral, pointer, 0);

  return concatBytes([...files, centralData, endOfCentral]);
};

const getImageExtension = (mimeType?: string | null) => {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
  };
  if (mimeType && map[mimeType]) return map[mimeType]!;
  if (mimeType?.startsWith("image/")) {
    const guess = mimeType.split("/")[1];
    if (guess) return guess;
  }
  return "img";
};

const makeUniqueName = (name: string, used: Map<string, number>) => {
  const existing = used.get(name);
  if (!existing) {
    used.set(name, 1);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let counter = existing + 1;
  let candidate = `${stem}-${counter}${ext}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${stem}-${counter}${ext}`;
  }
  used.set(name, counter);
  used.set(candidate, 1);
  return candidate;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function HomePage() {
  const [selectedConversation, setSelectedConversation] = useState<
    string | null
  >(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([]);
  const [isSelectingMessages, setIsSelectingMessages] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    new Set(),
  );
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(
    null,
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDownloadingImages, setIsDownloadingImages] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const forceScrollRef = useRef(false);

  const utils = api.useUtils();

  const { data: conversations, refetch: refetchConversations } =
    api.conversation.list.useQuery();
  const activeConversation = conversations?.find(
    (conv) => conv.id === selectedConversation,
  );
  const { data: messages } = api.message.listByConversation.useQuery(
    { conversationId: selectedConversation! },
    { enabled: !!selectedConversation },
  );

  const createConversation = api.conversation.create.useMutation({
    onSuccess: (data) => {
      void refetchConversations();
      setSelectedConversation(data.id);
      setIsSidebarOpen(false);
      setIsCreateDialogOpen(false);
      setNewChatTitle("");
    },
  });

  const deleteConversation = api.conversation.delete.useMutation({
    onSuccess: (_data, variables) => {
      void utils.conversation.list.invalidate();
      if (selectedConversation === variables.id) {
        setSelectedConversation(null);
      }
      setOptimisticMessages((current) =>
        current.filter((message) => message.conversationId !== variables.id),
      );
    },
  });

  const sendTextMessage = api.message.sendText.useMutation();
  const sendFileMessage = api.message.sendFile.useMutation();

  const deleteMessage = api.message.delete.useMutation({
    onSuccess: () => {
      void utils.message.listByConversation.invalidate({
        conversationId: selectedConversation!,
      });
    },
  });

  const batchDeleteMessages = api.message.batchDelete.useMutation({
    onSuccess: () => {
      if (!selectedConversation) return;
      void utils.message.listByConversation.invalidate({
        conversationId: selectedConversation,
      });
    },
  });

  const createTempId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `temp-${crypto.randomUUID()}`;
    }
    return `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const upsertMessageInCache = (conversationId: string, message: Message) => {
    utils.message.listByConversation.setData({ conversationId }, (current) => {
      if (!current) return [message];
      if (current.some((item) => item.id === message.id)) return current;
      const next = [...current, message];
      next.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      return next;
    });
  };

  const addOptimisticMessage = (message: Omit<Message, "id" | "createdAt">) => {
    const tempId = createTempId();
    forceScrollRef.current = true;
    setOptimisticMessages((current) => [
      ...current,
      {
        ...message,
        id: tempId,
        createdAt: new Date(),
        status: "sending",
      },
    ]);
    return tempId;
  };

  const updateOptimisticMessage = (
    id: string,
    status: OptimisticMessage["status"],
    errorMessage?: string,
  ) => {
    setOptimisticMessages((current) =>
      current.map((message) =>
        message.id === id
          ? { ...message, status, errorMessage }
          : message,
      ),
    );
  };

  const removeOptimisticMessage = (id: string) => {
    setOptimisticMessages((current) =>
      current.filter((message) => message.id !== id),
    );
  };

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    return "Message failed to send";
  };

  const getDefaultChatTitle = () => {
    return new Date().toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openCreateDialog = () => {
    setNewChatTitle(getDefaultChatTitle());
    setIsCreateDialogOpen(true);
  };

  const handleCreateConversation = () => {
    const fallbackTitle = getDefaultChatTitle();
    const title = newChatTitle.trim() || fallbackTitle;
    createConversation.mutate({ title });
  };

  const handleDeleteConversation = (conversationId: string) => {
    setConfirmDialog({
      title: "Delete this chat?",
      description: "This will remove the chat and all its messages.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deleteConversation.mutate({ id: conversationId }),
    });
  };

  const sendTextToServer = async (conversationId: string, content: string) => {
    const message = await sendTextMessage.mutateAsync({
      conversationId,
      content,
    });
    upsertMessageInCache(conversationId, message);
    void utils.message.listByConversation.invalidate({ conversationId });
    void utils.conversation.list.invalidate();
    return message;
  };

  const sendFileToServer = async (input: {
    conversationId: string;
    type: "IMAGE" | "FILE" | "VIDEO";
    content: string;
    originalName?: string | null;
    mimeType?: string | null;
    size?: number | null;
  }) => {
    const message = await sendFileMessage.mutateAsync({
      conversationId: input.conversationId,
      type: input.type,
      content: input.content,
      originalName: input.originalName ?? undefined,
      mimeType: input.mimeType ?? undefined,
      size: input.size ?? undefined,
    });
    upsertMessageInCache(input.conversationId, message);
    void utils.message.listByConversation.invalidate({
      conversationId: input.conversationId,
    });
    void utils.conversation.list.invalidate();
    return message;
  };

  const sendTextOptimistically = async (
    conversationId: string,
    content: string,
  ) => {
    const tempId = addOptimisticMessage({
      conversationId,
      type: "TEXT",
      content,
      originalName: null,
      mimeType: null,
      size: null,
      isDeleted: false,
    });
    try {
      await sendTextToServer(conversationId, content);
      removeOptimisticMessage(tempId);
    } catch (error) {
      updateOptimisticMessage(tempId, "failed", getErrorMessage(error));
    }
  };

  const sendFileOptimistically = async (input: {
    conversationId: string;
    type: "IMAGE" | "FILE" | "VIDEO";
    content: string;
    originalName?: string | null;
    mimeType?: string | null;
    size?: number | null;
  }) => {
    const tempId = addOptimisticMessage({
      conversationId: input.conversationId,
      type: input.type,
      content: input.content,
      originalName: input.originalName ?? null,
      mimeType: input.mimeType ?? null,
      size: input.size ?? null,
      isDeleted: false,
    });
    try {
      await sendFileToServer(input);
      removeOptimisticMessage(tempId);
    } catch (error) {
      updateOptimisticMessage(tempId, "failed", getErrorMessage(error));
    }
  };

  const handleFilesDropped = async (files: File[]) => {
    if (!selectedConversation) return;
    try {
      const uploaded = await uploadLocalFiles(files, {
        conversationId: selectedConversation,
      });
      await Promise.all(
        uploaded.map((file) => {
          const fileType = file.type.startsWith("image/")
            ? "IMAGE"
            : file.type.startsWith("video/")
              ? "VIDEO"
              : "FILE";

          return sendFileOptimistically({
            conversationId: selectedConversation,
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
      alert(
        "Upload failed: " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  };

  const handleSendText = async (content: string) => {
    if (!selectedConversation) return;
    await sendTextOptimistically(selectedConversation, content);
  };

  const handleSendFile = async (file: {
    type: "IMAGE" | "FILE" | "VIDEO";
    content: string;
    originalName: string;
    mimeType: string;
    size: number;
  }) => {
    if (!selectedConversation) return;
    await sendFileOptimistically({
      conversationId: selectedConversation,
      ...file,
    });
  };

  const handleRetryMessage = async (message: Message) => {
    if (message.status !== "failed") return;
    updateOptimisticMessage(message.id, "sending");
    try {
      if (message.type === "TEXT") {
        await sendTextToServer(message.conversationId, message.content);
      } else {
        await sendFileToServer({
          conversationId: message.conversationId,
          type: message.type,
          content: message.content,
          originalName: message.originalName ?? undefined,
          mimeType: message.mimeType ?? undefined,
          size: message.size ?? undefined,
        });
      }
      removeOptimisticMessage(message.id);
    } catch (error) {
      updateOptimisticMessage(message.id, "failed", getErrorMessage(error));
    }
  };

  useEffect(() => {
    setIsSelectingMessages(false);
    setSelectedMessageIds(new Set());
  }, [selectedConversation]);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  };

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const threshold = 120;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    isNearBottomRef.current = distanceFromBottom < threshold;
  };

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const clearMessageSelection = () => {
    setIsSelectingMessages(false);
    setSelectedMessageIds(new Set());
  };

  const deleteSelectedMessages = async () => {
    if (selectedMessageIds.size === 0) return;

    const selectedMessages = visibleMessages.filter((message) =>
      selectedMessageIds.has(message.id),
    );
    const serverIds = selectedMessages
      .filter((message) => !message.status)
      .map((message) => message.id);
    const optimisticIds = selectedMessages
      .filter((message) => message.status)
      .map((message) => message.id);

    try {
      if (serverIds.length) {
        await batchDeleteMessages.mutateAsync({ ids: serverIds });
      }
      if (optimisticIds.length) {
        setOptimisticMessages((current) =>
          current.filter((message) => !optimisticIds.includes(message.id)),
        );
      }
      clearMessageSelection();
    } catch (error) {
      alert(
        "Delete failed: " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  };

  const handleDeleteSelectedMessages = () => {
    if (selectedMessageIds.size === 0) return;
    setConfirmDialog({
      title: "Delete selected messages?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: deleteSelectedMessages,
    });
  };

  const handleDownloadSelectedImages = async () => {
    if (isDownloadingImages) return;
    const selectedImages = visibleMessages.filter(
      (message) =>
        selectedMessageIds.has(message.id) && message.type === "IMAGE",
    );
    if (!selectedImages.length) return;

    if (selectedImages.length === 1) {
      const message = selectedImages[0]!;
      const filename =
        message.originalName ??
        `image-1.${getImageExtension(message.mimeType)}`;
      const link = document.createElement("a");
      link.href = message.content;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }

    setIsDownloadingImages(true);
    try {
      const usedNames = new Map<string, number>();
      const entries: ZipEntry[] = [];
      for (let index = 0; index < selectedImages.length; index += 1) {
        const message = selectedImages[index]!;
        const response = await fetch(message.content);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${message.content}`);
        }
        const data = new Uint8Array(await response.arrayBuffer());
        const fallbackName = `image-${index + 1}.${getImageExtension(
          message.mimeType,
        )}`;
        const baseName = message.originalName || fallbackName;
        const name = makeUniqueName(baseName, usedNames);
        entries.push({ name, data });
      }

      const zipData = createZip(entries);
      const stamp = new Date()
        .toISOString()
        .slice(0, 16)
        .replace(/[-:T]/g, "");
      downloadBlob(
        new Blob([zipData], { type: "application/zip" }),
        `images-${stamp}.zip`,
      );
    } catch (error) {
      alert(
        "Download failed: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setIsDownloadingImages(false);
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    setConfirmDialog({
      title: "Delete this message?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deleteMessage.mutate({ id: messageId }),
    });
  };

  const visibleMessages = useMemo(() => {
    if (!selectedConversation) return [];
    const serverMessages: Message[] = messages ?? [];
    const optimisticForConversation = optimisticMessages.filter(
      (message) => message.conversationId === selectedConversation,
    );
    if (!optimisticForConversation.length) return serverMessages;
    const combined = [...serverMessages, ...optimisticForConversation];
    combined.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    return combined;
  }, [messages, optimisticMessages, selectedConversation]);

  const formatDateLabel = (date: Date) =>
    date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  const formatTimeLabel = (date: Date) =>
    date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const isSameMinute = (a: Date, b: Date) =>
    isSameDay(a, b) &&
    a.getHours() === b.getHours() &&
    a.getMinutes() === b.getMinutes();

  const messagesWithLabels = useMemo(() => {
    return visibleMessages.map((message, index) => {
      const currentDate = new Date(message.createdAt);
      const prevMessage = index > 0 ? visibleMessages[index - 1] : null;
      let timestampLabel: string | null = null;

      if (!prevMessage) {
        timestampLabel = formatDateLabel(currentDate);
      } else {
        const prevDate = new Date(prevMessage.createdAt);
        if (!isSameDay(prevDate, currentDate)) {
          timestampLabel = formatDateLabel(currentDate);
        } else if (!isSameMinute(prevDate, currentDate)) {
          timestampLabel = formatTimeLabel(currentDate);
        }
      }

      return { message, timestampLabel };
    });
  }, [visibleMessages]);

  useEffect(() => {
    if (!scrollContainerRef.current) return;
    if (forceScrollRef.current || isNearBottomRef.current) {
      scrollToBottom(forceScrollRef.current ? "smooth" : "auto");
      forceScrollRef.current = false;
    }
  }, [selectedConversation, visibleMessages.length]);

  const handleConfirmDialog = async () => {
    if (!confirmDialog) return;
    setIsConfirming(true);
    try {
      await confirmDialog.onConfirm();
    } finally {
      setIsConfirming(false);
      setConfirmDialog(null);
    }
  };

  const selectedMessages = useMemo(
    () =>
      visibleMessages.filter((message) => selectedMessageIds.has(message.id)),
    [selectedMessageIds, visibleMessages],
  );

  const selectedImageCount = useMemo(
    () => selectedMessages.filter((message) => message.type === "IMAGE").length,
    [selectedMessages],
  );

  const conversationList = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pb-4">
        <button
          onClick={openCreateDialog}
          disabled={createConversation.isPending}
          className="w-full rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
        >
          {createConversation.isPending ? "Creating..." : "New Chat"}
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-6">
        {conversations?.map((conv, idx) => {
          const isActive = selectedConversation === conv.id;
          return (
            <div
              key={conv.id}
              className={`group relative w-full rounded-2xl border transition motion-safe:animate-[chat-fade_0.35s_ease-out_both] ${
                isActive
                  ? "border-slate-900/10 bg-white shadow-sm"
                  : "border-transparent bg-white/60 hover:border-slate-200 hover:bg-white"
              }`}
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <button
                onClick={() => {
                  setSelectedConversation(conv.id);
                  setIsSidebarOpen(false);
                }}
                className="w-full rounded-2xl px-4 py-3 text-left"
              >
                <div className="truncate text-sm font-semibold text-slate-900">
                  {conv.title}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {new Date(conv.updatedAt).toLocaleDateString()}
                </div>
              </button>
              <button
                onClick={() => handleDeleteConversation(conv.id)}
                className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500 opacity-100 transition hover:border-red-200 hover:text-red-600 md:opacity-0 md:group-hover:opacity-100"
              >
                Delete
              </button>
            </div>
          );
        })}
        {!conversations?.length && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-500">
            No conversations yet.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-[radial-gradient(1200px_circle_at_10%_-10%,#dbeafe_0%,transparent_45%),radial-gradient(900px_circle_at_100%_0%,#fde68a_0%,transparent_40%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] text-slate-900 motion-safe:animate-[chat-rise_0.6s_ease-out]">
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            aria-label="Close dialog"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => {
              if (!isConfirming) setConfirmDialog(null);
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-2xl backdrop-blur">
            <div className="text-lg font-semibold">{confirmDialog.title}</div>
            {confirmDialog.description && (
              <p className="mt-1 text-xs text-slate-500">
                {confirmDialog.description}
              </p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDialog(null)}
                disabled={isConfirming}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                {confirmDialog.cancelLabel ?? "Cancel"}
              </button>
              <button
                onClick={handleConfirmDialog}
                disabled={isConfirming}
                className={`rounded-full px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 ${
                  confirmDialog.danger
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-slate-900"
                }`}
              >
                {isConfirming
                  ? "Working..."
                  : (confirmDialog.confirmLabel ?? "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
      {isCreateDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            aria-label="Close dialog"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setIsCreateDialogOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-2xl backdrop-blur">
            <div className="text-lg font-semibold">New Chat</div>
            <p className="mt-1 text-xs text-slate-500">
              Give it a name or confirm to use the current time.
            </p>
            <input
              value={newChatTitle}
              onChange={(e) => setNewChatTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateConversation();
                }
              }}
              className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 shadow-inner focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="Chat name"
              autoFocus
              disabled={createConversation.isPending}
            />
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsCreateDialogOpen(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConversation}
                disabled={createConversation.isPending}
                className="rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
              >
                {createConversation.isPending ? "Creating..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            aria-label="Close sidebar"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div className="relative z-10 h-full w-[85%] max-w-xs border-r border-slate-200/70 bg-white/80 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-4">
              <div className="text-lg font-semibold tracking-tight">Chats</div>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            {conversationList}
          </div>
        </div>
      )}

      {/* Sidebar (Desktop) */}
      <div className="hidden md:flex w-72 flex-col border-r border-slate-200/70 bg-white/70 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-5">
          <div className="text-xl font-semibold tracking-tight">PWT</div>
          <button
            onClick={() => void signOut()}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            Sign Out
          </button>
        </div>
        {conversationList}
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0 min-w-0 flex-col">
        <div className="flex items-center justify-between border-b border-slate-200/60 bg-white/70 px-4 py-3 backdrop-blur-xl md:hidden">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            Chats
          </button>
          <div className="text-base font-semibold tracking-tight">
            {activeConversation?.title ?? "PWT"}
          </div>
          <button
            onClick={() => void signOut()}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            Sign Out
          </button>
        </div>

        {selectedConversation ? (
          <DropZone
            onFilesDropped={handleFilesDropped}
            className="flex flex-1 min-h-0 min-w-0 overflow-x-hidden"
          >
            <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
              {/* Messages */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 pb-24 pt-0 md:pb-6 scroll-pb-24 md:scroll-pb-6"
              >
                <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200/60 bg-white/80 px-4 py-3 text-[11px] text-slate-500 backdrop-blur">
                  <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2">
                    <div>{visibleMessages.length} messages</div>
                    {isSelectingMessages ? (
                      <div className="flex items-center gap-2">
                        <span>{selectedMessageIds.size} selected</span>
                        <button
                          onClick={handleDeleteSelectedMessages}
                          disabled={selectedMessageIds.size === 0}
                          className="rounded-full border border-red-200 px-3 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                        <button
                          onClick={handleDownloadSelectedImages}
                          disabled={selectedImageCount === 0 || isDownloadingImages}
                          className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {isDownloadingImages ? "Preparing..." : "Download Images"}
                        </button>
                        <button
                          onClick={clearMessageSelection}
                          className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          Done
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setIsSelectingMessages(true)}
                        disabled={visibleMessages.length === 0}
                        className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pt-4">
                  {visibleMessages.length ? (
                    <div className="flex min-h-full flex-col justify-end gap-3">
                      {messagesWithLabels.map(({ message, timestampLabel }) => (
                        <MessageItem
                          key={message.id}
                          message={message}
                          timestampLabel={timestampLabel}
                          onDelete={handleDeleteMessage}
                          onRetry={handleRetryMessage}
                          isSelectable={isSelectingMessages}
                          isSelected={selectedMessageIds.has(message.id)}
                          onToggleSelect={toggleMessageSelection}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-[50vh] items-center justify-center text-sm text-slate-500">
                      No messages yet. Start the conversation!
                    </div>
                  )}
                </div>
              </div>

              {/* Input Area */}
              <div className="shrink-0 border-t border-slate-200/60 bg-white/80 px-4 pb-4 pt-3 backdrop-blur-xl">
                <div className="mx-auto w-full max-w-3xl min-w-0">
                  <InputArea
                    conversationId={selectedConversation}
                    onSendText={handleSendText}
                    onSendFile={handleSendFile}
                    isSending={sendTextMessage.isPending || sendFileMessage.isPending}
                  />
                </div>
              </div>
            </div>
          </DropZone>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="w-full max-w-md rounded-3xl border border-slate-200/70 bg-white/70 p-8 text-center shadow-sm backdrop-blur-xl">
              <div className="text-lg font-semibold">Start a new chat</div>
              <p className="mt-2 text-sm text-slate-600">
                Pick a conversation on the left or create a fresh one to begin.
              </p>
              <button
                onClick={openCreateDialog}
                disabled={createConversation.isPending}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
              >
                {createConversation.isPending ? "Creating..." : "New Chat"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
