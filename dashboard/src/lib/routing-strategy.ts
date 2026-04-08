export const ROUTING_STRATEGIES = ["round-robin", "fill-first"] as const;

export type RoutingStrategy = (typeof ROUTING_STRATEGIES)[number];

export const DEFAULT_ROUTING_STRATEGY: RoutingStrategy = "round-robin";

export function isRoutingStrategy(value: unknown): value is RoutingStrategy {
  return typeof value === "string" && ROUTING_STRATEGIES.includes(value as RoutingStrategy);
}
