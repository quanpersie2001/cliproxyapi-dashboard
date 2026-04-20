import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { getStateAccentBorderStyle, getStateToneStyle, type StateTone } from "@/components/ui/state-styles";

interface AlertSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone: StateTone;
  accent?: boolean;
}

export function AlertSurface({
  tone,
  accent = false,
  className,
  style,
  children,
  ...props
}: AlertSurfaceProps) {
  return (
    <div
      className={cn("rounded-md border p-3", accent && "border-l-4", className)}
      style={{
        ...getStateToneStyle(tone),
        ...(accent ? getStateAccentBorderStyle(tone) : {}),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
