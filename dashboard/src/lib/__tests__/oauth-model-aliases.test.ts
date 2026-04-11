import { describe, expect, it } from "vitest";
import {
  readOAuthModelAliases,
  removeOAuthAlias,
  sanitizeOAuthModelAliases,
  saveOAuthAliasDefinition,
  stripOAuthModelAliasIds,
} from "@/lib/oauth-model-aliases";

describe("readOAuthModelAliases", () => {
  it("accepts wrapped oauth-model-alias payloads", () => {
    expect(
      readOAuthModelAliases({
        "oauth-model-alias": {
          codex: [{ name: "gpt-5", alias: "chat" }],
        },
      })
    ).toEqual({
      codex: [{ name: "gpt-5", alias: "chat", fork: undefined, _id: undefined }],
    });
  });
});

describe("sanitizeOAuthModelAliases", () => {
  it("normalizes provider keys, trims fields, and deduplicates mappings", () => {
    expect(
      stripOAuthModelAliasIds(
        sanitizeOAuthModelAliases({
          " Codex ": [
            { name: " gpt-5 ", alias: " chat ", fork: false },
            { name: "gpt-5", alias: "chat", fork: true },
            { name: "", alias: "unused" },
          ],
          empty: [],
        })
      )
    ).toEqual({
      codex: [{ name: "gpt-5", alias: "chat", fork: true }],
    });
  });
});

describe("removeOAuthAlias", () => {
  it("removes an alias across every provider", () => {
    expect(
      stripOAuthModelAliasIds(
        removeOAuthAlias(
          {
            codex: [
              { name: "gpt-5", alias: "chat" },
              { name: "gpt-5-mini", alias: "mini" },
            ],
            claude: [{ name: "sonnet", alias: "chat" }],
          },
          "chat"
        )
      )
    ).toEqual({
      codex: [{ name: "gpt-5-mini", alias: "mini" }],
    });
  });
});

describe("saveOAuthAliasDefinition", () => {
  it("replaces the edited alias and preserves unrelated aliases", () => {
    expect(
      stripOAuthModelAliasIds(
        saveOAuthAliasDefinition(
          {
            codex: [
              { name: "gpt-5", alias: "chat" },
              { name: "gpt-5-mini", alias: "mini" },
            ],
            claude: [{ name: "sonnet", alias: "chat" }],
          },
          {
            previousAlias: "chat",
            alias: "assistant",
            mappings: [
              { provider: "codex", name: "gpt-5", fork: true },
              { provider: "claude", name: "sonnet" },
            ],
          }
        )
      )
    ).toEqual({
      claude: [{ name: "sonnet", alias: "assistant" }],
      codex: [
        { name: "gpt-5", alias: "assistant", fork: true },
        { name: "gpt-5-mini", alias: "mini" },
      ],
    });
  });

  it("merges into an existing alias when renaming to an alias that already exists", () => {
    expect(
      stripOAuthModelAliasIds(
        saveOAuthAliasDefinition(
          {
            codex: [
              { name: "gpt-5", alias: "chat" },
              { name: "gpt-5-mini", alias: "assistant" },
            ],
          },
          {
            previousAlias: "chat",
            alias: "assistant",
            mappings: [{ provider: "codex", name: "gpt-5", fork: true }],
          }
        )
      )
    ).toEqual({
      codex: [
        { name: "gpt-5", alias: "assistant", fork: true },
        { name: "gpt-5-mini", alias: "assistant" },
      ],
    });
  });
});
