import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const conversationRouter = createTRPCRouter({
  // Get all conversations for the current user
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.conversation.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }),

  // Create a new conversation
  create: protectedProcedure
    .input(z.object({ title: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.conversation.create({
        data: {
          title: input.title ?? "New Chat",
          userId: ctx.session.user.id,
        },
      });
    }),

  // Rename a conversation
  rename: protectedProcedure
    .input(z.object({ id: z.string(), title: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.conversation.update({
        where: { id: input.id, userId: ctx.session.user.id },
        data: { title: input.title },
      });
    }),

  // Delete a conversation
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.conversation.delete({
        where: { id: input.id, userId: ctx.session.user.id },
      });
    }),

  // Get a single conversation with all messages
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.conversation.findUnique({
        where: { id: input.id, userId: ctx.session.user.id },
        include: {
          messages: {
            where: { isDeleted: false },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }),
});
