import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const MODEL_PRICING_SOURCE_TYPES = [
  "manual",
  "official_api",
  "official_doc",
  "import",
] as const;

export const ModelPricingSourceTypeSchema = z.enum(MODEL_PRICING_SOURCE_TYPES);

const decimalField = z.coerce.number().finite().nonnegative();
const optionalDecimalField = z.coerce.number().finite().nonnegative().nullable().optional();
const optionalDateField = z.coerce.date().nullable().optional();

const pricingBaseShape = {
  provider: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200).nullable().optional(),
  promptPriceUsd: decimalField,
  completionPriceUsd: decimalField,
  cachedPriceUsd: optionalDecimalField,
  reasoningPriceUsd: optionalDecimalField,
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter ISO code")
    .transform((value) => value.toUpperCase())
    .optional()
    .default("USD"),
  sourceType: ModelPricingSourceTypeSchema.optional().default("manual"),
  sourceUrl: z.string().trim().url().nullable().optional(),
  manualOverride: z.boolean().optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.coerce.date().optional(),
  lastSyncedAt: optionalDateField,
  syncError: z.string().trim().max(2000).nullable().optional(),
};

const pricingUpdateShape = {
  provider: z.string().trim().min(1).max(100).optional(),
  model: z.string().trim().min(1).max(200).optional(),
  displayName: z.string().trim().min(1).max(200).nullable().optional(),
  promptPriceUsd: decimalField.optional(),
  completionPriceUsd: decimalField.optional(),
  cachedPriceUsd: optionalDecimalField,
  reasoningPriceUsd: optionalDecimalField,
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter ISO code")
    .transform((value) => value.toUpperCase())
    .optional(),
  sourceType: ModelPricingSourceTypeSchema.optional(),
  sourceUrl: z.string().trim().url().nullable().optional(),
  manualOverride: z.boolean().optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.coerce.date().optional(),
  lastSyncedAt: optionalDateField,
  syncError: z.string().trim().max(2000).nullable().optional(),
};

export const ModelPricingCreateSchema = z.object(pricingBaseShape).extend({
  manualOverride: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true),
  effectiveFrom: z.coerce.date().optional().default(() => new Date()),
});

export const ModelPricingUpdateSchema = z
  .object(pricingUpdateShape)
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "At least one field must be provided",
  });

export type ModelPricingCreateInput = z.infer<typeof ModelPricingCreateSchema>;
export type ModelPricingUpdateInput = z.infer<typeof ModelPricingUpdateSchema>;

export interface ModelPricingDTO {
  id: string;
  provider: string;
  model: string;
  displayName: string | null;
  promptPriceUsd: number;
  completionPriceUsd: number;
  cachedPriceUsd: number | null;
  reasoningPriceUsd: number | null;
  currency: string;
  sourceType: string;
  sourceUrl: string | null;
  manualOverride: boolean;
  isActive: boolean;
  effectiveFrom: string;
  lastSyncedAt: string | null;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
}

type ModelPricingRecord = Prisma.ModelPricingGetPayload<Record<string, never>>;

function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

export function serializeModelPricing(pricing: ModelPricingRecord): ModelPricingDTO {
  return {
    id: pricing.id,
    provider: pricing.provider,
    model: pricing.model,
    displayName: pricing.displayName,
    promptPriceUsd: pricing.promptPriceUsd.toNumber(),
    completionPriceUsd: pricing.completionPriceUsd.toNumber(),
    cachedPriceUsd: toNumber(pricing.cachedPriceUsd),
    reasoningPriceUsd: toNumber(pricing.reasoningPriceUsd),
    currency: pricing.currency,
    sourceType: pricing.sourceType,
    sourceUrl: pricing.sourceUrl,
    manualOverride: pricing.manualOverride,
    isActive: pricing.isActive,
    effectiveFrom: pricing.effectiveFrom.toISOString(),
    lastSyncedAt: pricing.lastSyncedAt?.toISOString() ?? null,
    syncError: pricing.syncError,
    createdAt: pricing.createdAt.toISOString(),
    updatedAt: pricing.updatedAt.toISOString(),
  };
}

function buildCreateData(input: ModelPricingCreateInput) {
  const data: Prisma.ModelPricingCreateInput = {
    provider: input.provider,
    model: input.model,
    displayName: input.displayName ?? null,
    promptPriceUsd: input.promptPriceUsd,
    completionPriceUsd: input.completionPriceUsd,
    cachedPriceUsd: input.cachedPriceUsd ?? null,
    reasoningPriceUsd: input.reasoningPriceUsd ?? null,
    currency: input.currency ?? "USD",
    sourceType: input.sourceType ?? "manual",
    sourceUrl: input.sourceUrl ?? null,
    manualOverride: input.manualOverride ?? true,
    isActive: input.isActive ?? true,
    effectiveFrom: input.effectiveFrom ?? new Date(),
    lastSyncedAt: input.lastSyncedAt ?? null,
    syncError: input.syncError ?? null,
  };

  return data;
}

function buildUpdateData(
  existing: ModelPricingRecord,
  input: ModelPricingUpdateInput,
): Prisma.ModelPricingUpdateInput {
  return {
    provider: input.provider ?? existing.provider,
    model: input.model ?? existing.model,
    displayName: input.displayName === undefined ? existing.displayName : input.displayName,
    promptPriceUsd: input.promptPriceUsd ?? existing.promptPriceUsd,
    completionPriceUsd: input.completionPriceUsd ?? existing.completionPriceUsd,
    cachedPriceUsd:
      input.cachedPriceUsd === undefined ? existing.cachedPriceUsd : input.cachedPriceUsd,
    reasoningPriceUsd:
      input.reasoningPriceUsd === undefined ? existing.reasoningPriceUsd : input.reasoningPriceUsd,
    currency: input.currency ?? existing.currency,
    sourceType: input.sourceType ?? existing.sourceType,
    sourceUrl: input.sourceUrl === undefined ? existing.sourceUrl : input.sourceUrl,
    manualOverride: input.manualOverride ?? existing.manualOverride,
    isActive: input.isActive ?? existing.isActive,
    effectiveFrom: input.effectiveFrom ?? existing.effectiveFrom,
    lastSyncedAt: input.lastSyncedAt === undefined ? existing.lastSyncedAt : input.lastSyncedAt,
    syncError: input.syncError === undefined ? existing.syncError : input.syncError,
  };
}

export async function listModelPricing(options: { includeInactive?: boolean } = {}): Promise<ModelPricingDTO[]> {
  const pricing = await prisma.modelPricing.findMany({
    where: options.includeInactive ? undefined : { isActive: true },
    orderBy: [
      { isActive: "desc" },
      { provider: "asc" },
      { model: "asc" },
    ],
  });

  return pricing.map(serializeModelPricing);
}

export async function getModelPricingById(id: string): Promise<ModelPricingDTO | null> {
  const pricing = await prisma.modelPricing.findUnique({
    where: { id },
  });

  return pricing ? serializeModelPricing(pricing) : null;
}

export async function findModelPricingByProviderAndModel(
  provider: string,
  model: string,
): Promise<ModelPricingDTO | null> {
  const pricing = await prisma.modelPricing.findUnique({
    where: { provider_model: { provider, model } },
  });

  return pricing ? serializeModelPricing(pricing) : null;
}

export async function createModelPricing(input: ModelPricingCreateInput): Promise<ModelPricingDTO> {
  const pricing = await prisma.modelPricing.create({
    data: buildCreateData(input),
  });

  return serializeModelPricing(pricing);
}

export async function updateModelPricing(
  id: string,
  input: ModelPricingUpdateInput,
): Promise<ModelPricingDTO | null> {
  const existing = await prisma.modelPricing.findUnique({
    where: { id },
  });

  if (!existing) {
    return null;
  }

  const pricing = await prisma.modelPricing.update({
    where: { id },
    data: buildUpdateData(existing, input),
  });

  return serializeModelPricing(pricing);
}

export async function deactivateModelPricing(id: string): Promise<ModelPricingDTO | null> {
  const existing = await prisma.modelPricing.findUnique({
    where: { id },
  });

  if (!existing) {
    return null;
  }

  const pricing = await prisma.modelPricing.update({
    where: { id },
    data: {
      isActive: false,
    },
  });

  return serializeModelPricing(pricing);
}
