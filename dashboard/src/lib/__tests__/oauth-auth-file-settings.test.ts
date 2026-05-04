import { describe, expect, it } from "vitest";

import {
  buildOAuthAuthFileSettingsPayload,
  createOAuthAuthFileSettingsEditor,
  updateOAuthAuthFileSettingsEditor,
} from "@/lib/providers/oauth-auth-file-settings";

function parsePayload(rawText: string) {
  return JSON.parse(rawText) as Record<string, unknown>;
}

describe("oauth auth-file settings editor", () => {
  it("preserves hidden advanced fields when editing note", () => {
    let editor = createOAuthAuthFileSettingsEditor(
      JSON.stringify({
        prefix: "demo",
        note: "night traffic",
        websockets: true,
        disable_cooling: true,
        excluded_models: ["gpt-4o"],
        headers: {
          Authorization: "Bearer x",
        },
      }),
      "codex"
    );

    editor = updateOAuthAuthFileSettingsEditor(editor, "note", "night traffic - backup");

    expect(parsePayload(buildOAuthAuthFileSettingsPayload(editor))).toEqual({
      prefix: "demo",
      note: "night traffic - backup",
      websockets: true,
      disable_cooling: true,
      excluded_models: ["gpt-4o"],
      headers: {
        Authorization: "Bearer x",
      },
    });
  });

  it("preserves untouched headers subtree when editing only note", () => {
    let editor = createOAuthAuthFileSettingsEditor(
      JSON.stringify({
        prefix: "demo",
        note: "night traffic",
        headers: {
          "X-Zebra": "1",
          Authorization: " Bearer x ",
        },
      }),
      "codex"
    );

    editor = updateOAuthAuthFileSettingsEditor(editor, "note", "night traffic - backup");

    expect(parsePayload(buildOAuthAuthFileSettingsPayload(editor))).toEqual({
      prefix: "demo",
      note: "night traffic - backup",
      headers: {
        "X-Zebra": "1",
        Authorization: " Bearer x ",
      },
    });
  });

  it("preserves hidden advanced fields when editing headers", () => {
    let editor = createOAuthAuthFileSettingsEditor(
      JSON.stringify({
        prefix: "demo",
        websocket: true,
        disable_cooling: true,
        excluded_models: ["gpt-4o-mini"],
        headers: {
          Authorization: "Bearer x",
        },
      }),
      "codex"
    );

    editor = updateOAuthAuthFileSettingsEditor(
      editor,
      "headersText",
      JSON.stringify(
        {
          Authorization: "Bearer y",
          "X-Trace": "oauth",
        },
        null,
        2
      )
    );

    expect(parsePayload(buildOAuthAuthFileSettingsPayload(editor))).toEqual({
      prefix: "demo",
      websocket: true,
      disable_cooling: true,
      excluded_models: ["gpt-4o-mini"],
      headers: {
        Authorization: "Bearer y",
        "X-Trace": "oauth",
      },
    });
  });

  it("validates proxy URL and blocks payload generation when proxy is invalid", () => {
    let editor = createOAuthAuthFileSettingsEditor(
      JSON.stringify({
        proxy_url: "socks5://user:pass@host:1080",
      }),
      "codex"
    );

    editor = updateOAuthAuthFileSettingsEditor(editor, "proxyUrl", "socks5://user:pass@host:portt");

    expect(editor.proxyUrlError).toBe("Proxy URL must be a valid absolute URL.");
    expect(() => buildOAuthAuthFileSettingsPayload(editor)).toThrow("Proxy URL must be a valid absolute URL.");
  });

  it("keeps valid proxy URL in payload", () => {
    const editor = createOAuthAuthFileSettingsEditor(
      JSON.stringify({
        proxy_url: "socks5://user:pass@proxy-us:1080",
      }),
      "codex"
    );

    expect(parsePayload(buildOAuthAuthFileSettingsPayload(editor))).toEqual({
      proxy_url: "socks5://user:pass@proxy-us:1080",
    });
  });
});
