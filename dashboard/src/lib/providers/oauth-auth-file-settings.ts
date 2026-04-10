const INTEGER_STRING_PATTERN = /^[+-]?\d+$/;
const TRUTHY_TEXT_VALUES = new Set(["true", "1", "yes", "y", "on"]);
const FALSY_TEXT_VALUES = new Set(["false", "0", "no", "n", "off"]);

export const OAUTH_AUTH_FILE_MAX_BYTES = 1024 * 1024;

export type DisableCoolingMode = "inherit" | "true" | "false";

export interface OAuthAuthFileSettingsEditor {
  originalText: string;
  json: Record<string, unknown>;
  isCodexFile: boolean;
  prefix: string;
  proxyUrl: string;
  priority: string;
  excludedModelsText: string;
  disableCooling: DisableCoolingMode;
  websockets: boolean;
  note: string;
  noteTouched: boolean;
}

export type OAuthAuthFileSettingsField =
  | "prefix"
  | "proxyUrl"
  | "priority"
  | "excludedModelsText"
  | "disableCooling"
  | "websockets"
  | "note";

export type OAuthAuthFileSettingsFieldValue = string | boolean;

function normalizeProviderKey(value: string): string {
  return value.trim().toLowerCase();
}

function isCodexProvider(provider: string): boolean {
  const normalized = normalizeProviderKey(provider);
  return normalized === "codex";
}

function parsePriorityValue(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || !INTEGER_STRING_PATTERN.test(trimmed)) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function normalizeExcludedModels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of value) {
    const model = String(entry ?? "").trim().toLowerCase();
    if (!model || seen.has(model)) {
      continue;
    }
    seen.add(model);
    normalized.push(model);
  }

  return normalized.sort((left, right) => left.localeCompare(right));
}

function parseExcludedModelsText(value: string): string[] {
  return normalizeExcludedModels(value.split(/[\n,]+/));
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (TRUTHY_TEXT_VALUES.has(normalized)) {
    return true;
  }
  if (FALSY_TEXT_VALUES.has(normalized)) {
    return false;
  }
  return undefined;
}

function readCodexAuthFileWebsockets(value: Record<string, unknown>): boolean {
  return parseOptionalBoolean(value.websockets) ?? false;
}

function applyCodexAuthFileWebsockets(
  value: Record<string, unknown>,
  websockets: boolean
): Record<string, unknown> {
  const next = { ...value };
  delete next.websocket;
  next.websockets = websockets;
  return next;
}

export function createOAuthAuthFileSettingsEditor(
  rawText: string,
  provider: string
): OAuthAuthFileSettingsEditor {
  const trimmed = rawText.trim();
  const parsed = JSON.parse(trimmed) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Auth file must contain a JSON object.");
  }

  const json = { ...(parsed as Record<string, unknown>) };
  const codexFile = isCodexProvider(provider);

  if (codexFile) {
    const normalizedWebsockets = readCodexAuthFileWebsockets(json);
    delete json.websocket;
    json.websockets = normalizedWebsockets;
  }

  const originalText = JSON.stringify(json);
  const priority = parsePriorityValue(json.priority);
  const disableCoolingValue = parseOptionalBoolean(json.disable_cooling);

  return {
    originalText,
    json,
    isCodexFile: codexFile,
    prefix: typeof json.prefix === "string" ? json.prefix : "",
    proxyUrl: typeof json.proxy_url === "string" ? json.proxy_url : "",
    priority: priority !== undefined ? String(priority) : "",
    excludedModelsText: normalizeExcludedModels(json.excluded_models).join("\n"),
    disableCooling:
      disableCoolingValue === undefined ? "inherit" : disableCoolingValue ? "true" : "false",
    websockets: readCodexAuthFileWebsockets(json),
    note: typeof json.note === "string" ? json.note : "",
    noteTouched: false,
  };
}

export function updateOAuthAuthFileSettingsEditor(
  editor: OAuthAuthFileSettingsEditor,
  field: OAuthAuthFileSettingsField,
  value: OAuthAuthFileSettingsFieldValue
): OAuthAuthFileSettingsEditor {
  if (field === "websockets") {
    return { ...editor, websockets: Boolean(value) };
  }

  if (field === "note") {
    return {
      ...editor,
      note: String(value),
      noteTouched: true,
    };
  }

  return {
    ...editor,
    [field]: String(value),
  };
}

export function buildOAuthAuthFileSettingsPayload(
  editor: OAuthAuthFileSettingsEditor
): string {
  const next: Record<string, unknown> = { ...editor.json };

  if ("prefix" in next || editor.prefix.trim()) {
    next.prefix = editor.prefix;
  }

  if ("proxy_url" in next || editor.proxyUrl.trim()) {
    next.proxy_url = editor.proxyUrl;
  }

  const parsedPriority = parsePriorityValue(editor.priority);
  if (parsedPriority !== undefined) {
    next.priority = parsedPriority;
  } else if ("priority" in next) {
    delete next.priority;
  }

  const excludedModels = parseExcludedModelsText(editor.excludedModelsText);
  if (excludedModels.length > 0) {
    next.excluded_models = excludedModels;
  } else if ("excluded_models" in next) {
    delete next.excluded_models;
  }

  if (editor.disableCooling === "true") {
    next.disable_cooling = true;
  } else if (editor.disableCooling === "false") {
    next.disable_cooling = false;
  } else if ("disable_cooling" in next) {
    delete next.disable_cooling;
  }

  if (editor.noteTouched) {
    const noteValue = editor.note.trim();
    if (noteValue) {
      next.note = editor.note;
    } else if ("note" in next) {
      delete next.note;
    }
  }

  const payload = editor.isCodexFile
    ? applyCodexAuthFileWebsockets(next, editor.websockets)
    : next;

  return JSON.stringify(payload);
}

export function formatOAuthAuthFileSettingsPreview(
  editor: OAuthAuthFileSettingsEditor
): string {
  const payload = buildOAuthAuthFileSettingsPayload(editor);

  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

export function isOAuthAuthFileSettingsDirty(
  editor: OAuthAuthFileSettingsEditor
): boolean {
  return buildOAuthAuthFileSettingsPayload(editor) !== editor.originalText;
}
