import { describe, expect, it } from "vitest";
import {
  getInternalProxyUrl,
  groupProxyModelsByProvider,
  normalizeProxyModels,
  type ProxyModel,
} from "@/lib/proxy-models";

describe("getInternalProxyUrl", () => {
  it("derives the proxy origin from the management endpoint", () => {
    expect(
      getInternalProxyUrl("https://proxy.example.com/v0/management"),
    ).toBe("https://proxy.example.com");
  });

  it("falls back to the default internal proxy URL for invalid values", () => {
    expect(getInternalProxyUrl("not-a-url")).toBe("http://cliproxyapi:8317");
  });
});

describe("normalizeProxyModels", () => {
  it("deduplicates by model id and sorts the catalog", () => {
    const models: ProxyModel[] = [
      { id: "gpt-4.1", owned_by: "openai" },
      { id: "claude-sonnet-4.5", owned_by: "anthropic" },
      { id: "gpt-4.1", owned_by: "openai" },
      { id: "gemini-2.5-pro", owned_by: "google" },
    ];

    expect(normalizeProxyModels(models)).toEqual([
      { id: "claude-sonnet-4.5", owned_by: "anthropic" },
      { id: "gemini-2.5-pro", owned_by: "google" },
      { id: "gpt-4.1", owned_by: "openai" },
    ]);
  });
});

describe("groupProxyModelsByProvider", () => {
  it("groups models by provider and keeps duplicate ids across different providers", () => {
    const groups = groupProxyModelsByProvider([
      { id: "gpt-4.1", owned_by: "openai" },
      { id: "gpt-4.1", owned_by: "OpenRouter" },
      { id: "claude-sonnet-4.5", owned_by: "anthropic" },
      { id: "claude-sonnet-4.5", owned_by: "anthropic" },
      { id: "custom-alias", owned_by: "My Gateway" },
    ]);

    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["Claude", ["claude-sonnet-4.5"]],
      ["OpenAI/Codex", ["gpt-4.1"]],
      ["My Gateway", ["custom-alias"]],
      ["OpenRouter", ["gpt-4.1"]],
    ]);
  });

  it("falls back to id heuristics when owned_by is empty", () => {
    const groups = groupProxyModelsByProvider([
      { id: "gemini-2.5-pro", owned_by: "" },
      { id: "gpt-4.1", owned_by: "" },
    ]);

    expect(groups.map((group) => [group.label, group.items.length])).toEqual([
      ["Gemini", 1],
      ["OpenAI/Codex", 1],
    ]);
  });

  it("merges provider labels that differ only by owned_by casing", () => {
    const groups = groupProxyModelsByProvider([
      { id: "glm-4.5", owned_by: "zai" },
      { id: "glm-4.5-air", owned_by: "ZAI" },
    ]);

    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["ZAI", ["glm-4.5", "glm-4.5-air"]],
    ]);
  });

  it("assigns unique ids when distinct provider labels collapse to the same slug", () => {
    const groups = groupProxyModelsByProvider([
      { id: "alpha-1", owned_by: "Alpha+Beta" },
      { id: "alpha-2", owned_by: "Alpha Beta" },
    ]);

    expect(groups.map((group) => group.label)).toEqual(["Alpha Beta", "Alpha+Beta"]);
    expect(new Set(groups.map((group) => group.id)).size).toBe(groups.length);
  });
});
