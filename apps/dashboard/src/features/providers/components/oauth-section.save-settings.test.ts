import { describe, expect, it, vi } from "vitest";

import {
  createOAuthAuthFileSettingsEditor,
  updateOAuthAuthFileSettingsEditor,
} from "@/lib/providers/oauth-auth-file-settings";
import { saveOAuthAuthFileSettings } from "@/features/providers/components/oauth-section";

describe("saveOAuthAuthFileSettings", () => {
  it("returns validation error and aborts before PATCH when headers JSON is invalid", async () => {
    let editor = createOAuthAuthFileSettingsEditor(
      JSON.stringify({
        prefix: "demo",
        headers: { Authorization: "Bearer x" },
      }),
      "codex"
    );

    editor = updateOAuthAuthFileSettingsEditor(editor, "headersText", "{not-json");

    const fetchMock = vi.fn();
    const result = await saveOAuthAuthFileSettings("oauth-1", editor, fetchMock as typeof fetch);

    expect(result).toEqual({
      ok: false,
      error: "Custom Headers must be valid JSON.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends PATCH when payload is valid", async () => {
    const editor = createOAuthAuthFileSettingsEditor(
      JSON.stringify({
        prefix: "demo",
        headers: { Authorization: "Bearer x" },
      }),
      "codex"
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await saveOAuthAuthFileSettings("oauth-1", editor, fetchMock as typeof fetch);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/providers/oauth/oauth-1/settings",
      expect.objectContaining({
        method: "PATCH",
      })
    );
  });
});
