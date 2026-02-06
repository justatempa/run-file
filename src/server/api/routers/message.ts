import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { MessageType } from "../../../../generated/prisma/index.js";

export const messageRouter = createTRPCRouter({
  // Send a text message
  sendText: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        content: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Update conversation's updatedAt
      await ctx.db.conversation.update({
        where: { id: input.conversationId, userId: ctx.session.user.id },
        data: { updatedAt: new Date() },
      });

      return ctx.db.message.create({
        data: {
          conversationId: input.conversationId,
          type: MessageType.TEXT,
          content: input.content,
        },
      });
    }),

  // Send a file message
  sendFile: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        type: z.enum(["IMAGE", "FILE", "VIDEO"]),
        content: z.string(), // URL from uploadthing
        originalName: z.string().optional(),
        mimeType: z.string().optional(),
        size: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Update conversation's updatedAt
      await ctx.db.conversation.update({
        where: { id: input.conversationId, userId: ctx.session.user.id },
        data: { updatedAt: new Date() },
      });

      return ctx.db.message.create({
        data: {
          conversationId: input.conversationId,
          type: input.type as MessageType,
          content: input.content,
          originalName: input.originalName,
          mimeType: input.mimeType,
          size: input.size,
        },
      });
    }),

  // Get messages by conversation
  listByConversation: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify user owns this conversation
      const conversation = await ctx.db.conversation.findUnique({
        where: { id: input.conversationId, userId: ctx.session.user.id },
      });

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      return ctx.db.message.findMany({
        where: {
          conversationId: input.conversationId,
          isDeleted: false,
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  // Delete a message (soft delete)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.message.update({
        where: { id: input.id },
        data: { isDeleted: true },
      });
    }),

  // Batch delete messages
  batchDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.message.updateMany({
        where: { id: { in: input.ids } },
        data: { isDeleted: true },
      });
    }),
});
