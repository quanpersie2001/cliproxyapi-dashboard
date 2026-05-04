const INTEGER_STRING_PATTERN = /^[+-]?\d+$/;

export const OAUTH_AUTH_FILE_MAX_BYTES = 1024 * 1024;

type OAuthAuthFileHeaders = Record<string, string>;

export interface OAuthAuthFileSettingsEditor {
  originalText: string;
  json: Record<string, unknown>;
  isCodexFile: boolean;
  prefix: string;
  proxyUrl: string;
  priority: string;
  headersText: string;
  headersTouched: boolean;
  headersError: string | null;
  note: string;
  noteTouched: boolean;
}

export type OAuthAuthFileSettingsField =
  | "prefix"
  | "proxyUrl"
  | "priority"
  | "headersText"
  | "note";

export type OAuthAuthFileSettingsFieldValue = string;

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

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeHeaders(value: unknown): OAuthAuthFileHeaders {
  if (!isRecordObject(value)) {
    return {};
  }

  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce<OAuthAuthFileHeaders>((result, [key, rawValue]) => {
      if (typeof rawValue !== "string") {
        return result;
      }

      const name = key.trim();
      const headerValue = rawValue.trim();

      if (!name || !headerValue) {
        return result;
      }

      result[name] = headerValue;
      return result;
    }, {});
}

function formatHeadersText(value: OAuthAuthFileHeaders): string {
  if (Object.keys(value).length === 0) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

function validateHeadersValue(value: unknown): string | null {
  if (!isRecordObject(value)) {
    return "Custom Headers must be a JSON object.";
  }

  return Object.values(value).every((item) => typeof item === "string")
    ? null
    : "Custom Headers values must be strings.";
}

function parseHeadersText(text: string): {
  value: OAuthAuthFileHeaders | null;
  error: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { value: null, error: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { value: null, error: "Custom Headers must be valid JSON." };
  }

  const error = validateHeadersValue(parsed);
  if (error) {
    return { value: null, error };
  }

  return { value: normalizeHeaders(parsed), error: null };
}

function normalizePriorityField(value: unknown): number | undefined {
  const priority = parsePriorityValue(value);
  return priority !== undefined ? priority : undefined;
}

function sanitizeOAuthAuthFileJson(value: Record<string, unknown>): Record<string, unknown> {
  const next = { ...value };

  delete next.excluded_models;
  delete next.disable_cooling;
  delete next.websocket;
  delete next.websockets;

  if (typeof next.prefix === "string" && !next.prefix.trim()) {
    delete next.prefix;
  }

  if (typeof next.proxy_url === "string" && !next.proxy_url.trim()) {
    delete next.proxy_url;
  }

  const priority = normalizePriorityField(next.priority);
  if (priority !== undefined) {
    next.priority = priority;
  } else if ("priority" in next) {
    delete next.priority;
  }

  if (typeof next.note === "string" && !next.note.trim()) {
    delete next.note;
  }

  const headers = normalizeHeaders(next.headers);
  if (Object.keys(headers).length > 0) {
    next.headers = headers;
  } else if ("headers" in next) {
    delete next.headers;
  }

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

  const json = sanitizeOAuthAuthFileJson(parsed as Record<string, unknown>);
  const codexFile = isCodexProvider(provider);

  const originalText = JSON.stringify(json);
  const priority = normalizePriorityField(json.priority);

  return {
    originalText,
    json,
    isCodexFile: codexFile,
    prefix: typeof json.prefix === "string" ? json.prefix : "",
    proxyUrl: typeof json.proxy_url === "string" ? json.proxy_url : "",
    priority: priority !== undefined ? String(priority) : "",
    headersText: formatHeadersText(normalizeHeaders(json.headers)),
    headersTouched: false,
    headersError: null,
    note: typeof json.note === "string" ? json.note : "",
    noteTouched: false,
  };
}

export function updateOAuthAuthFileSettingsEditor(
  editor: OAuthAuthFileSettingsEditor,
  field: OAuthAuthFileSettingsField,
  value: OAuthAuthFileSettingsFieldValue
): OAuthAuthFileSettingsEditor {
  if (field === "note") {
    return {
      ...editor,
      note: String(value),
      noteTouched: true,
    };
  }

  if (field === "headersText") {
    const nextValue = String(value);
    const { error } = parseHeadersText(nextValue);

    return {
      ...editor,
      headersText: nextValue,
      headersTouched: true,
      headersError: error,
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
  const next = sanitizeOAuthAuthFileJson(editor.json);

  if (editor.prefix.trim()) {
    next.prefix = editor.prefix;
  } else if ("prefix" in next) {
    delete next.prefix;
  }

  if (editor.proxyUrl.trim()) {
    next.proxy_url = editor.proxyUrl;
  } else if ("proxy_url" in next) {
    delete next.proxy_url;
  }

  const parsedPriority = parsePriorityValue(editor.priority);
  if (parsedPriority !== undefined) {
    next.priority = parsedPriority;
  } else if ("priority" in next) {
    delete next.priority;
  }

  if (editor.noteTouched) {
    const noteValue = editor.note.trim();
    if (noteValue) {
      next.note = editor.note;
    } else if ("note" in next) {
      delete next.note;
    }
  }

  const { value: headers, error } = parseHeadersText(editor.headersText);
  if (error) {
    throw new Error(error);
  }

  if (headers && Object.keys(headers).length > 0) {
    next.headers = headers;
  } else if ("headers" in next) {
    delete next.headers;
  }

  return JSON.stringify(next);
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
  if (editor.headersTouched && editor.headersError) {
    const originalPriority = normalizePriorityField(editor.json.priority);
    const originalHeadersText = formatHeadersText(normalizeHeaders(editor.json.headers));
    const originalNote = typeof editor.json.note === "string" ? editor.json.note : "";

    return (
      editor.prefix !== (typeof editor.json.prefix === "string" ? editor.json.prefix : "") ||
      editor.proxyUrl !== (typeof editor.json.proxy_url === "string" ? editor.json.proxy_url : "") ||
      editor.priority !== (originalPriority !== undefined ? String(originalPriority) : "") ||
      editor.headersText !== originalHeadersText ||
      (editor.noteTouched && editor.note !== originalNote)
    );
  }

  return buildOAuthAuthFileSettingsPayload(editor) !== editor.originalText;
}
