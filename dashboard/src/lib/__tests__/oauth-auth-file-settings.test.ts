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
});
