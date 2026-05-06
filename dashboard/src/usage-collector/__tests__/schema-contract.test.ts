import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { UsageQueueInboxStatus } from "@/generated/prisma/enums";

describe("usage queue ingestion schema contract", () => {
  it("exposes the queue inbox model and status enum", () => {
    expect(Object.values(Prisma.ModelName)).toContain("UsageQueueInbox");
    expect(UsageQueueInboxStatus).toMatchObject({
      pending: "pending",
      processing: "processing",
      processed: "processed",
      decode_failed: "decode_failed",
      process_failed: "process_failed",
      discarded: "discarded",
    });
  });

  it("adds event-key metadata to usage records while preserving legacy dedupe fields", () => {
    expect(Prisma.UsageRecordScalarFieldEnum).toHaveProperty("eventKey");
    expect(Prisma.UsageRecordScalarFieldEnum).toHaveProperty("requestId");
    expect(Prisma.UsageRecordScalarFieldEnum).toHaveProperty("provider");
    expect(Prisma.UsageRecordScalarFieldEnum).toHaveProperty("authType");

    expect(Prisma.UsageRecordScalarFieldEnum).toHaveProperty("authIndex");
    expect(Prisma.UsageRecordScalarFieldEnum).toHaveProperty("model");
    expect(Prisma.UsageRecordScalarFieldEnum).toHaveProperty("source");
    expect(Prisma.UsageRecordScalarFieldEnum).toHaveProperty("totalTokens");
  });
});
