import { type CSSProperties, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const BADGE_TONE_STYLES: Record<BadgeTone, CSSProperties> = {
  neutral: {
    borderColor: "var(--badge-neutral-border)",
    backgroundColor: "var(--badge-neutral-bg)",
    color: "var(--badge-neutral-text)",
  },
  info: {
    borderColor: "var(--badge-info-border)",
    backgroundColor: "var(--badge-info-bg)",
    color: "var(--badge-info-text)",
  },
  success: {
    borderColor: "var(--badge-success-border)",
    backgroundColor: "var(--badge-success-bg)",
    color: "var(--badge-success-text)",
  },
  warning: {
    borderColor: "var(--badge-warning-border)",
    backgroundColor: "var(--badge-warning-bg)",
    color: "var(--badge-warning-text)",
  },
  danger: {
    borderColor: "var(--badge-danger-border)",
    backgroundColor: "var(--badge-danger-bg)",
    color: "var(--badge-danger-text)",
  },
};

const BADGE_DOT_STYLES: Record<BadgeTone, CSSProperties> = {
  neutral: { backgroundColor: "var(--badge-neutral-dot)" },
  info: { backgroundColor: "var(--badge-info-dot)" },
  success: { backgroundColor: "var(--badge-success-dot)" },
  warning: { backgroundColor: "var(--badge-warning-dot)" },
  danger: { backgroundColor: "var(--badge-danger-dot)" },
};

export function getBadgeToneStyle(tone: BadgeTone): CSSProperties {
  return BADGE_TONE_STYLES[tone];
}

const BADGE_SIZE_CLASS_NAMES = {
  xs: "px-2 py-0.5 text-[10px]",
  sm: "px-2 py-0.5 text-xs",
} as const;

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: keyof typeof BADGE_SIZE_CLASS_NAMES;
  dot?: boolean;
}

export function Badge({
  tone = "neutral",
  size = "sm",
  dot = false,
  className,
  style,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium leading-none",
        BADGE_SIZE_CLASS_NAMES[size],
        dot && "gap-1",
        className
      )}
      style={{ ...BADGE_TONE_STYLES[tone], ...style }}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full"
          style={BADGE_DOT_STYLES[tone]}
        />
      ) : null}
      {children}
    </span>
  );
}
