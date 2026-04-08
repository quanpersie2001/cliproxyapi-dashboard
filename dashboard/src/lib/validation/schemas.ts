import { z } from "zod";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "@/lib/auth/validation";

export const ContainerActionSchema = z.object({
  action: z.enum(["start", "stop", "restart"], {
    message: "Invalid action. Allowed: start, stop, restart",
  }),
  confirm: z.literal(true, {
    message: "Confirmation required: set confirm to true",
  }),
});

export const FetchModelsSchema = z.object({
  baseUrl: z.string().url("Base URL must be a valid URL (http:// or https://)"),
  apiKey: z.string().min(1),
});

export const CreateCustomProviderSchema = z.object({
  name: z.string().min(1).max(100),
  providerId: z.string().regex(/^[a-z0-9-]+$/, "Provider ID must be lowercase alphanumeric with hyphens"),
  baseUrl: z.string().url("Base URL must be a valid URL (http:// or https://)"),
  apiKey: z.string().min(1),
  prefix: z.string().optional(),
  proxyUrl: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  models: z.array(z.object({
    upstreamName: z.string().min(1),
    alias: z.string().min(1),
  })).min(1, "At least one model mapping is required"),
  excludedModels: z.array(z.string()).optional(),
});

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

const SETTINGS_ALLOWLIST = new Set([
  "max_provider_keys_per_user",
  "telegram_bot_token",
  "telegram_chat_id",
  "telegram_alerts_enabled",
  "telegram_alert_providers",
]);

export const AdminSettingSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(255)
    .refine((k) => SETTINGS_ALLOWLIST.has(k), {
      message: "Setting key is not allowed",
    }),
  value: z.string().min(1).max(1000),
});

export { SETTINGS_ALLOWLIST };

export const ConfirmActionSchema = z.object({
  confirm: z.literal(true, {
    message: "Confirmation required: set confirm to true",
  }),
});

const DOCKER_TAG_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

export const UpdateProxySchema = z.object({
  version: z
    .string()
    .default("latest")
    .refine((v) => v === "latest" || DOCKER_TAG_PATTERN.test(v), {
      message: "Invalid version format",
    }),
  confirm: z.literal(true, {
    message: "Confirmation required: set confirm to true",
  }),
});

export const DeploySchema = z.object({
  noCache: z.boolean().optional(),
});

export const CreateProviderGroupSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const UpdateProviderGroupSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const ReorderProviderGroupsSchema = z.object({
  groupIds: z.array(z.string()).min(1),
});

export const ReorderCustomProvidersSchema = z.object({
  providerIds: z.array(z.string()).min(1),
});

export const ImportOAuthCredentialSchema = z.object({
  provider: z.string().min(1, "Provider is required"),
  fileName: z.string().min(1, "File name is required").max(500),
  fileContent: z.string().min(2, "File content is required").max(1024 * 1024, "File content too large (max 1MB)"),
});

export type ImportOAuthCredentialInput = z.infer<typeof ImportOAuthCredentialSchema>;
