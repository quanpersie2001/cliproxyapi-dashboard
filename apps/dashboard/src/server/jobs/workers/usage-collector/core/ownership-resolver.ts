export interface OwnershipLink {
  userId: string;
  apiKeyId: string | null;
}

export interface AuthFileOwnershipHint {
  fileName: string;
  email: string | null;
}

export interface UsageOwnershipDirectories {
  fullKeyToOwner: Map<string, OwnershipLink>;
  authIndexToFile: Map<string, AuthFileOwnershipHint>;
  sourceToUser: Map<string, string>;
  authIndexPrefixToOwner: Map<string, OwnershipLink>;
  userToApiKey: Map<string, string>;
}

export interface UsageOwnershipInput {
  apiGroupKey: string | null;
  apiKey?: string | null;
  authIndex: string;
  source: string | null;
}

export interface UsageOwnershipResult {
  userId: string | null;
  apiKeyId: string | null;
  resolutionPath:
    | "api-grouping"
    | "auth-file-filename"
    | "auth-file-email"
    | "source"
    | "auth-index-prefix"
    | "none";
}

export function resolveUsageOwnership(
  input: UsageOwnershipInput,
  directories: UsageOwnershipDirectories
): UsageOwnershipResult {
  let resolvedUserId: string | null = null;
  let resolvedApiKeyId: string | null = null;
  let resolutionPath: UsageOwnershipResult["resolutionPath"] = "none";

  const providedApiKey = normalizeText(input.apiKey);
  if (providedApiKey.startsWith("sk-")) {
    const ownerFromApiKey = directories.fullKeyToOwner.get(providedApiKey);
    if (ownerFromApiKey) {
      return {
        userId: ownerFromApiKey.userId,
        apiKeyId: ownerFromApiKey.apiKeyId,
        resolutionPath: "api-grouping",
      };
    }
  }

  const groupKey = normalizeText(input.apiGroupKey);
  if (groupKey.startsWith("sk-")) {
    const groupedOwner = directories.fullKeyToOwner.get(groupKey);
    if (groupedOwner) {
      return {
        userId: groupedOwner.userId,
        apiKeyId: groupedOwner.apiKeyId,
        resolutionPath: "api-grouping",
      };
    }
  }

  const authIndex = normalizeText(input.authIndex).toLowerCase();
  const authFileHint = directories.authIndexToFile.get(authIndex);
  if (authFileHint) {
    const byFileName = findMappedUser(authFileHint.fileName, directories.sourceToUser);
    if (byFileName) {
      resolvedUserId = byFileName;
      resolutionPath = "auth-file-filename";
    } else {
      const byEmail = findMappedUser(authFileHint.email, directories.sourceToUser);
      if (byEmail) {
        resolvedUserId = byEmail;
        resolutionPath = "auth-file-email";
      }
    }
  }

  if (!resolvedUserId) {
    const fromSource = findMappedUser(input.source, directories.sourceToUser);
    if (fromSource) {
      resolvedUserId = fromSource;
      resolutionPath = "source";
    }
  }

  if (!resolvedUserId) {
    const byAuthPrefix = findOwnerByAuthIndex(authIndex, directories.authIndexPrefixToOwner);
    if (byAuthPrefix) {
      resolvedUserId = byAuthPrefix.userId;
      resolvedApiKeyId = byAuthPrefix.apiKeyId;
      resolutionPath = "auth-index-prefix";
    }
  }

  if (resolvedUserId && !resolvedApiKeyId) {
    resolvedApiKeyId = directories.userToApiKey.get(resolvedUserId) ?? null;
  }

  return {
    userId: resolvedUserId,
    apiKeyId: resolvedApiKeyId,
    resolutionPath,
  };
}

function findMappedUser(
  candidate: string | null | undefined,
  sourceToUser: Map<string, string>
): string | null {
  const key = normalizeText(candidate).toLowerCase();
  if (!key) {
    return null;
  }
  return sourceToUser.get(key) ?? null;
}

function findOwnerByAuthIndex(
  authIndex: string,
  authIndexPrefixToOwner: Map<string, OwnershipLink>
): OwnershipLink | null {
  const exact = authIndexPrefixToOwner.get(authIndex);
  if (exact) {
    return exact;
  }

  for (const [maskedIdentifier, owner] of authIndexPrefixToOwner.entries()) {
    const delimiter = maskedIdentifier.indexOf("...");
    if (delimiter <= 0) {
      continue;
    }

    const prefix = maskedIdentifier.slice(0, delimiter);
    const suffix = maskedIdentifier.slice(delimiter + 3);
    if (!prefix || !suffix) {
      continue;
    }

    if (authIndex.startsWith(prefix) && authIndex.endsWith(suffix)) {
      return owner;
    }
  }

  return null;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}
