"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getOAuthProviderPresentation,
  OAuthProviderIcon,
} from "@/components/providers/oauth-provider-meta";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DiagramMapping = {
  id: string;
  provider: string;
  name: string;
  fork: boolean;
};

export interface OAuthAliasDiagramItem {
  alias: string;
  mappings: DiagramMapping[];
  mappingCount: number;
  providerCount: number;
}

type ProviderNode = {
  provider: string;
  sources: SourceNode[];
};

type SourceNode = {
  id: string;
  provider: string;
  name: string;
  aliases: Array<{ alias: string; fork: boolean }>;
};

type AliasNode = {
  alias: string;
  providers: string[];
  sourceIds: string[];
  mappingCount: number;
};

type DiagramPath = {
  id: string;
  d: string;
  color: string;
};

type DragState =
  | { type: "provider"; id: string }
  | { type: "source"; provider: string; id: string }
  | { type: "alias"; id: string };

function getProviderColor(provider: string) {
  const presentation = getOAuthProviderPresentation(provider);
  const textColor = presentation.theme.text;
  if (textColor && !textColor.startsWith("var(")) {
    return textColor;
  }

  const borderColor = presentation.theme.border;
  const rgbaMatch = borderColor.match(
    /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*[\d.]+\s*\)$/i
  );
  if (rgbaMatch) {
    return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, 0.88)`;
  }

  const rgbMatch = borderColor.match(
    /^rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i
  );
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, 0.88)`;
  }

  return borderColor || "var(--text-secondary)";
}

function buildCurve(x1: number, y1: number, x2: number, y2: number) {
  const midpoint = x1 + (x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${midpoint} ${y1}, ${midpoint} ${y2}, ${x2} ${y2}`;
}

function mergeOrder(existingOrder: string[], nextIds: string[]) {
  const nextSet = new Set(nextIds);
  const kept = existingOrder.filter((id) => nextSet.has(id));
  const remaining = nextIds.filter((id) => !kept.includes(id));
  return [...kept, ...remaining];
}

function reorderItems(items: string[], fromId: string, toId: string) {
  if (fromId === toId) {
    return items;
  }

  const next = [...items];
  const fromIndex = next.indexOf(fromId);
  const toIndex = next.indexOf(toId);
  if (fromIndex === -1 || toIndex === -1) {
    return items;
  }

  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function CountPill({ value }: { value: number }) {
  return (
    <span className="rounded-full border border-[var(--surface-border)] bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--text-secondary)]">
      {value}
    </span>
  );
}

export function OAuthModelAliasDiagram({ items }: { items: OAuthAliasDiagramItem[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const providerRefs = useRef(new Map<string, HTMLDivElement>());
  const sourceRefs = useRef(new Map<string, HTMLDivElement>());
  const sourceGroupRefs = useRef(new Map<string, HTMLDivElement>());
  const aliasRefs = useRef(new Map<string, HTMLDivElement>());
  const [paths, setPaths] = useState<DiagramPath[]>([]);
  const [groupHeights, setGroupHeights] = useState<Record<string, number>>({});
  const [providerOrder, setProviderOrder] = useState<string[]>([]);
  const [sourceOrderByProvider, setSourceOrderByProvider] = useState<Record<string, string[]>>({});
  const [aliasOrder, setAliasOrder] = useState<string[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const totalMappings = useMemo(
    () => items.reduce((sum, item) => sum + item.mappingCount, 0),
    [items]
  );

  const { providerNodesBase, aliasNodesBase } = useMemo(() => {
    const sourceMap = new Map<string, SourceNode>();
    const aliasMap = new Map<string, AliasNode>();

    for (const item of items) {
      const aliasProviders = new Set<string>();
      const sourceIds: string[] = [];

      for (const mapping of item.mappings) {
        const provider = mapping.provider.trim().toLowerCase();
        const name = mapping.name.trim();
        if (!provider || !name) {
          continue;
        }

        aliasProviders.add(provider);

        const sourceId = `${provider}::${name.toLowerCase()}`;
        sourceIds.push(sourceId);

        const existingSource = sourceMap.get(sourceId);
        if (existingSource) {
          existingSource.aliases.push({ alias: item.alias, fork: mapping.fork });
        } else {
          sourceMap.set(sourceId, {
            id: sourceId,
            provider,
            name,
            aliases: [{ alias: item.alias, fork: mapping.fork }],
          });
        }
      }

      aliasMap.set(item.alias, {
        alias: item.alias,
        providers: Array.from(aliasProviders).sort((left, right) => left.localeCompare(right)),
        sourceIds: Array.from(new Set(sourceIds)),
        mappingCount: item.mappings.length,
      });
    }

    const providers = new Map<string, SourceNode[]>();

    for (const source of sourceMap.values()) {
      const dedupedAliases = new Map<string, { alias: string; fork: boolean }>();
      for (const aliasEntry of source.aliases) {
        const key = aliasEntry.alias.toLowerCase();
        const existing = dedupedAliases.get(key);
        if (!existing || (aliasEntry.fork && !existing.fork)) {
          dedupedAliases.set(key, aliasEntry);
        }
      }

      source.aliases = Array.from(dedupedAliases.values()).sort((left, right) =>
        left.alias.localeCompare(right.alias)
      );

      const providerSources = providers.get(source.provider) ?? [];
      providerSources.push(source);
      providers.set(source.provider, providerSources);
    }

    const providerNodesList = Array.from(providers.entries()).map(([provider, sources]) => ({
      provider,
      sources,
    }));

    const aliasNodesList = Array.from(aliasMap.values());

    return { providerNodesBase: providerNodesList, aliasNodesBase: aliasNodesList };
  }, [items]);

  const defaultAliasOrder = useMemo(() => {
    const sortedProviders = providerNodesBase
      .map((providerNode) => ({
        ...providerNode,
        sources: [...providerNode.sources].sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .sort((left, right) => left.provider.localeCompare(right.provider));

    const sourceOrder = new Map<string, number>();
    let orderIndex = 0;

    for (const providerNode of sortedProviders) {
      for (const source of providerNode.sources) {
        sourceOrder.set(source.id, orderIndex);
        orderIndex += 1;
      }
    }

    return [...aliasNodesBase]
      .map((aliasNode) => {
        const positions = aliasNode.sourceIds
          .map((sourceId) => sourceOrder.get(sourceId))
          .filter((position): position is number => typeof position === "number");

        const flowIndex =
          positions.length > 0
            ? positions.reduce((sum, position) => sum + position, 0) / positions.length
            : Number.MAX_SAFE_INTEGER;

        return {
          alias: aliasNode.alias,
          flowIndex,
          mappingCount: aliasNode.mappingCount,
        };
      })
      .sort((left, right) => {
        if (left.flowIndex !== right.flowIndex) {
          return left.flowIndex - right.flowIndex;
        }
        if (right.mappingCount !== left.mappingCount) {
          return right.mappingCount - left.mappingCount;
        }
        return left.alias.localeCompare(right.alias);
      })
      .map((aliasNode) => aliasNode.alias);
  }, [aliasNodesBase, providerNodesBase]);

  useEffect(() => {
    const nextProviderIds = providerNodesBase.map((providerNode) => providerNode.provider);
    setProviderOrder((current) => {
      const next = mergeOrder(current, nextProviderIds);
      return arraysEqual(current, next) ? current : next;
    });
  }, [providerNodesBase]);

  useEffect(() => {
    setSourceOrderByProvider((current) => {
      let changed = Object.keys(current).length !== providerNodesBase.length;
      const next: Record<string, string[]> = {};

      for (const providerNode of providerNodesBase) {
        const ids = providerNode.sources.map((source) => source.id);
        const merged = mergeOrder(current[providerNode.provider] ?? [], ids);
        next[providerNode.provider] = merged;

        if (!arraysEqual(current[providerNode.provider] ?? [], merged)) {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [providerNodesBase]);

  useEffect(() => {
    setAliasOrder((current) => {
      const next = mergeOrder(current, defaultAliasOrder);
      return arraysEqual(current, next) ? current : next;
    });
  }, [defaultAliasOrder]);

  const providerNodes = useMemo(() => {
    const providerMap = new Map(providerNodesBase.map((providerNode) => [providerNode.provider, providerNode]));
    const orderedProviders = mergeOrder(
      providerOrder,
      providerNodesBase.map((providerNode) => providerNode.provider)
    );

    return orderedProviders
      .map((providerId) => providerMap.get(providerId))
      .filter((providerNode): providerNode is ProviderNode => Boolean(providerNode))
      .map((providerNode) => {
        const sourceMap = new Map(providerNode.sources.map((source) => [source.id, source]));
        const orderedSourceIds = mergeOrder(
          sourceOrderByProvider[providerNode.provider] ?? [],
          providerNode.sources.map((source) => source.id)
        );

        return {
          ...providerNode,
          sources: orderedSourceIds
            .map((sourceId) => sourceMap.get(sourceId))
            .filter((source): source is SourceNode => Boolean(source)),
        };
      });
  }, [providerNodesBase, providerOrder, sourceOrderByProvider]);

  const aliasNodes = useMemo(() => {
    const aliasMap = new Map(aliasNodesBase.map((aliasNode) => [aliasNode.alias, aliasNode]));
    const orderedAliasIds = mergeOrder(aliasOrder, aliasNodesBase.map((aliasNode) => aliasNode.alias));

    return orderedAliasIds
      .map((aliasId) => aliasMap.get(aliasId))
      .filter((aliasNode): aliasNode is AliasNode => Boolean(aliasNode));
  }, [aliasNodesBase, aliasOrder]);

  const resetDragState = useCallback(() => {
    setDragState(null);
    setDropTargetId(null);
  }, []);

  const handleProviderDrop = useCallback(
    (targetProvider: string) => {
      if (!dragState || dragState.type !== "provider" || dragState.id === targetProvider) {
        resetDragState();
        return;
      }

      setProviderOrder((current) => reorderItems(current, dragState.id, targetProvider));
      resetDragState();
    },
    [dragState, resetDragState]
  );

  const handleSourceDrop = useCallback(
    (provider: string, targetSourceId: string) => {
      if (
        !dragState ||
        dragState.type !== "source" ||
        dragState.provider !== provider ||
        dragState.id === targetSourceId
      ) {
        resetDragState();
        return;
      }

      setSourceOrderByProvider((current) => ({
        ...current,
        [provider]: reorderItems(current[provider] ?? [], dragState.id, targetSourceId),
      }));
      resetDragState();
    },
    [dragState, resetDragState]
  );

  const handleAliasDrop = useCallback(
    (targetAlias: string) => {
      if (!dragState || dragState.type !== "alias" || dragState.id === targetAlias) {
        resetDragState();
        return;
      }

      setAliasOrder((current) => reorderItems(current, dragState.id, targetAlias));
      resetDragState();
    },
    [dragState, resetDragState]
  );

  const updateLayout = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const nextHeights: Record<string, number> = {};
    const nextPaths: DiagramPath[] = [];

    for (const providerNode of providerNodes) {
      const groupRect = sourceGroupRefs.current.get(providerNode.provider)?.getBoundingClientRect();
      if (groupRect) {
        nextHeights[providerNode.provider] = Math.round(groupRect.height);
      }

      const providerRect = providerRefs.current.get(providerNode.provider)?.getBoundingClientRect();
      if (!providerRect) {
        continue;
      }

      const providerColor = getProviderColor(providerNode.provider);
      const providerX = providerRect.right - containerRect.left;
      const providerY = providerRect.top + providerRect.height / 2 - containerRect.top;

      for (const source of providerNode.sources) {
        const sourceRect = sourceRefs.current.get(source.id)?.getBoundingClientRect();
        if (!sourceRect) {
          continue;
        }

        const sourceLeft = sourceRect.left - containerRect.left;
        const sourceRight = sourceRect.right - containerRect.left;
        const sourceY = sourceRect.top + sourceRect.height / 2 - containerRect.top;

        nextPaths.push({
          id: `provider:${providerNode.provider}:${source.id}`,
          d: buildCurve(providerX, providerY, sourceLeft, sourceY),
          color: providerColor,
        });

        for (const aliasEntry of source.aliases) {
          const aliasRect = aliasRefs.current.get(aliasEntry.alias)?.getBoundingClientRect();
          if (!aliasRect) {
            continue;
          }

          const aliasLeft = aliasRect.left - containerRect.left;
          const aliasY = aliasRect.top + aliasRect.height / 2 - containerRect.top;

          nextPaths.push({
            id: `source:${source.id}:${aliasEntry.alias}`,
            d: buildCurve(sourceRight, sourceY, aliasLeft, aliasY),
            color: providerColor,
          });
        }
      }
    }

    setPaths(nextPaths);
    setGroupHeights((current) => {
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(nextHeights);
      if (currentKeys.length !== nextKeys.length) {
        return nextHeights;
      }

      for (const key of nextKeys) {
        if (current[key] !== nextHeights[key]) {
          return nextHeights;
        }
      }

      return current;
    });
  }, [aliasNodes, providerNodes]);

  useLayoutEffect(() => {
    const rafId = window.requestAnimationFrame(updateLayout);
    window.addEventListener("resize", updateLayout);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateLayout);
    };
  }, [updateLayout]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateLayout();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [updateLayout]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Diagram View</h4>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            Read-only map of provider, source model, and shared alias relationships.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral" size="xs" className="w-fit rounded-sm">
            Read only
          </Badge>
          <Badge tone="info" size="xs" className="w-fit rounded-sm">
            {totalMappings} mapped link{totalMappings === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div
          ref={containerRef}
          className="relative grid min-w-[940px] w-full grid-cols-[240px_minmax(280px,1fr)_minmax(280px,1fr)] items-start gap-x-8 px-2 py-3"
        >
          <svg
            className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible"
            aria-hidden="true"
          >
            {paths.map((path) => (
              <path
                key={path.id}
                d={path.d}
                fill="none"
                stroke={path.color}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeOpacity="0.72"
              />
            ))}
          </svg>

          <div className="relative z-10 flex w-full flex-col gap-3">
            <div className="px-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Providers
              </div>
            </div>

            {providerNodes.map((providerNode) => {
              const presentation = getOAuthProviderPresentation(providerNode.provider);
              const providerColor = getProviderColor(providerNode.provider);
              const dropKey = `provider:${providerNode.provider}`;
              const isDragging =
                dragState?.type === "provider" && dragState.id === providerNode.provider;
              const isDropTarget = dropTargetId === dropKey;

              return (
                <div
                  key={providerNode.provider}
                  className="flex items-center justify-end"
                  style={
                    groupHeights[providerNode.provider]
                      ? { height: groupHeights[providerNode.provider] }
                      : undefined
                  }
                >
                  <div
                    ref={(node) => {
                      if (node) {
                        providerRefs.current.set(providerNode.provider, node);
                      } else {
                        providerRefs.current.delete(providerNode.provider);
                      }
                    }}
                    className={cn(
                      "relative w-full rounded-xl border px-3 py-2.5 transition-[transform,border-color,box-shadow,opacity] duration-150 cursor-grab active:cursor-grabbing",
                      isDragging && "opacity-60",
                      isDropTarget && "border-[var(--surface-border-strong)] ring-2 ring-blue-400/20"
                    )}
                    style={{
                      borderColor: presentation.theme.border,
                      background: `linear-gradient(180deg, ${presentation.theme.bg} 0%, var(--surface-base) 100%)`,
                      boxShadow: `inset 1px 0 0 ${providerColor}, var(--shadow-edge)`,
                    }}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", providerNode.provider);
                      event.dataTransfer.effectAllowed = "move";
                      setDragState({ type: "provider", id: providerNode.provider });
                      setDropTargetId(dropKey);
                    }}
                    onDragEnd={resetDragState}
                    onDragOver={(event) => {
                      if (
                        !dragState ||
                        dragState.type !== "provider" ||
                        dragState.id === providerNode.provider
                      ) {
                        return;
                      }
                      event.preventDefault();
                      setDropTargetId(dropKey);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleProviderDrop(providerNode.provider);
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute right-[-4px] top-1/2 size-2 -translate-y-1/2 rounded-full border-2 border-[var(--surface-base)] shadow-[0_0_0_1px_var(--surface-border)]"
                      style={{ backgroundColor: providerColor }}
                    />

                    <div className="flex items-center gap-3">
                      <OAuthProviderIcon provider={providerNode.provider} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                          {presentation.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                          {providerNode.sources.length} mapped model
                          {providerNode.sources.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <CountPill value={providerNode.sources.length} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative z-10 flex w-full flex-col items-center gap-3">
            <div className="w-full max-w-[320px] px-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Source Models
              </div>
            </div>

            {providerNodes.map((providerNode) => {
              const providerColor = getProviderColor(providerNode.provider);

              return (
                <div
                  key={providerNode.provider}
                  ref={(node) => {
                    if (node) {
                      sourceGroupRefs.current.set(providerNode.provider, node);
                    } else {
                      sourceGroupRefs.current.delete(providerNode.provider);
                    }
                  }}
                  className="w-full max-w-[320px] space-y-2.5"
                >
                  {providerNode.sources.map((source) => {
                    const hasFork = source.aliases.some((entry) => entry.fork);
                    const aliasPreview = source.aliases
                      .map((entry) => `${entry.alias}${entry.fork ? " (fork)" : ""}`)
                      .join(", ");
                    const dropKey = `source:${providerNode.provider}:${source.id}`;
                    const isDragging =
                      dragState?.type === "source" && dragState.id === source.id;
                    const isDropTarget = dropTargetId === dropKey;

                    return (
                      <div
                        key={source.id}
                        ref={(node) => {
                          if (node) {
                            sourceRefs.current.set(source.id, node);
                          } else {
                            sourceRefs.current.delete(source.id);
                          }
                        }}
                        className={cn(
                          "group relative overflow-visible rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] px-3.5 py-2.5 shadow-[var(--shadow-edge)] transition-[border-color,transform,box-shadow,opacity] duration-200 hover:-translate-y-px hover:border-[var(--surface-border-strong)] cursor-grab active:cursor-grabbing",
                          isDragging && "opacity-60",
                          isDropTarget && "border-[var(--surface-border-strong)] ring-2 ring-blue-400/20"
                        )}
                        title={aliasPreview}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", source.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDragState({
                            type: "source",
                            provider: providerNode.provider,
                            id: source.id,
                          });
                          setDropTargetId(dropKey);
                        }}
                        onDragEnd={resetDragState}
                        onDragOver={(event) => {
                          if (
                            !dragState ||
                            dragState.type !== "source" ||
                            dragState.provider !== providerNode.provider ||
                            dragState.id === source.id
                          ) {
                            return;
                          }
                          event.preventDefault();
                          setDropTargetId(dropKey);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleSourceDrop(providerNode.provider, source.id);
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="absolute right-[-4px] top-1/2 size-2 -translate-y-1/2 rounded-full border-2 border-[var(--surface-base)] shadow-[0_0_0_1px_var(--surface-border)]"
                          style={{ backgroundColor: providerColor }}
                        />

                        <div className="flex items-center gap-2">
                          <span
                            className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium leading-5 text-[var(--text-primary)]"
                            title={source.name}
                          >
                            {source.name}
                          </span>

                          {hasFork ? (
                            <span className="rounded-md border border-amber-200/70 bg-amber-50/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                              Fork
                            </span>
                          ) : null}

                          <CountPill value={source.aliases.length} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="relative z-10 flex w-full flex-col items-end gap-3">
            <div className="w-full max-w-[320px] px-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Aliases
              </div>
            </div>

            {aliasNodes.map((aliasNode) => {
              const providerNames = aliasNode.providers.map((provider) => {
                return getOAuthProviderPresentation(provider).name;
              });
              const dropKey = `alias:${aliasNode.alias}`;
              const isDragging =
                dragState?.type === "alias" && dragState.id === aliasNode.alias;
              const isDropTarget = dropTargetId === dropKey;

              return (
                <div
                  key={aliasNode.alias}
                  ref={(node) => {
                    if (node) {
                      aliasRefs.current.set(aliasNode.alias, node);
                    } else {
                      aliasRefs.current.delete(aliasNode.alias);
                    }
                  }}
                  className={cn(
                    "group relative w-full max-w-[320px] overflow-visible rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] px-3.5 py-2.5 shadow-[var(--shadow-edge)] transition-[border-color,transform,box-shadow,opacity] duration-200 hover:-translate-y-px hover:border-[var(--surface-border-strong)] cursor-grab active:cursor-grabbing",
                    isDragging && "opacity-60",
                    isDropTarget && "border-[var(--surface-border-strong)] ring-2 ring-blue-400/20"
                  )}
                  title={`${aliasNode.mappingCount} mapping${aliasNode.mappingCount === 1 ? "" : "s"} across ${aliasNode.providers.length} provider${aliasNode.providers.length === 1 ? "" : "s"}${providerNames.length > 0 ? `: ${providerNames.join(", ")}` : ""}`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", aliasNode.alias);
                    event.dataTransfer.effectAllowed = "move";
                    setDragState({ type: "alias", id: aliasNode.alias });
                    setDropTargetId(dropKey);
                  }}
                  onDragEnd={resetDragState}
                  onDragOver={(event) => {
                    if (
                      !dragState ||
                      dragState.type !== "alias" ||
                      dragState.id === aliasNode.alias
                    ) {
                      return;
                    }
                    event.preventDefault();
                    setDropTargetId(dropKey);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleAliasDrop(aliasNode.alias);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-[-4px] top-1/2 size-2 -translate-y-1/2 rounded-full border-2 border-[var(--surface-base)] bg-[var(--text-tertiary)] shadow-[0_0_0_1px_var(--surface-border)]"
                  />

                  <div className="flex items-center gap-2">
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold leading-5 text-[var(--text-primary)]"
                      title={aliasNode.alias}
                    >
                      {aliasNode.alias}
                    </span>
                    <CountPill value={aliasNode.mappingCount} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
