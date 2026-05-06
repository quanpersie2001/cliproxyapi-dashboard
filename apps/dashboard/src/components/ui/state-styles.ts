import { type CSSProperties } from "react";

export type StateTone = "info" | "success" | "warning" | "danger";

const STATE_TONE_STYLES: Record<StateTone, CSSProperties> = {
  info: {
    borderColor: "var(--state-info-border)",
    backgroundColor: "var(--state-info-bg)",
    color: "var(--state-info-text)",
  },
  success: {
    borderColor: "var(--state-success-border)",
    backgroundColor: "var(--state-success-bg)",
    color: "var(--state-success-text)",
  },
  warning: {
    borderColor: "var(--state-warning-border)",
    backgroundColor: "var(--state-warning-bg)",
    color: "var(--state-warning-text)",
  },
  danger: {
    borderColor: "var(--state-danger-border)",
    backgroundColor: "var(--state-danger-bg)",
    color: "var(--state-danger-text)",
  },
};

const STATE_ACCENT_BORDER_STYLES: Record<StateTone, CSSProperties> = {
  info: { borderLeftColor: "var(--state-info-accent)" },
  success: { borderLeftColor: "var(--state-success-accent)" },
  warning: { borderLeftColor: "var(--state-warning-accent)" },
  danger: { borderLeftColor: "var(--state-danger-accent)" },
};

const STATE_ICON_STYLES: Record<StateTone, CSSProperties> = {
  info: { ...STATE_TONE_STYLES.info, color: "var(--state-info-accent)" },
  success: { ...STATE_TONE_STYLES.success, color: "var(--state-success-accent)" },
  warning: { ...STATE_TONE_STYLES.warning, color: "var(--state-warning-accent)" },
  danger: { ...STATE_TONE_STYLES.danger, color: "var(--state-danger-accent)" },
};

const STATE_ACTION_STYLES: Record<StateTone, CSSProperties> = {
  info: { backgroundColor: "var(--state-info-accent)", color: "#ffffff" },
  success: { backgroundColor: "var(--state-success-accent)", color: "#052e16" },
  warning: { backgroundColor: "var(--state-warning-accent)", color: "#1f2937" },
  danger: { backgroundColor: "var(--state-danger-accent)", color: "#ffffff" },
};

export function getStateToneStyle(tone: StateTone): CSSProperties {
  return STATE_TONE_STYLES[tone];
}

export function getStateAccentBorderStyle(tone: StateTone): CSSProperties {
  return STATE_ACCENT_BORDER_STYLES[tone];
}

export function getStateIconToneStyle(tone: StateTone): CSSProperties {
  return STATE_ICON_STYLES[tone];
}

export function getStateActionStyle(tone: StateTone): CSSProperties {
  return STATE_ACTION_STYLES[tone];
}
