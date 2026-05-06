"use client";

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="text-sm font-semibold leading-none" aria-hidden="true">
      {n}
    </span>
  );
}

interface StepIndicatorProps {
  step: number;
  done: boolean;
  active: boolean;
}

export function StepIndicator({ step, done, active }: StepIndicatorProps) {
  if (done) {
    return (
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: "var(--state-success-bg)",
          color: "var(--state-success-accent)",
          boxShadow: "inset 0 0 0 1px var(--state-success-border)",
        }}
      >
        <CheckIcon />
      </div>
    );
  }
  if (active) {
    return (
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full shadow-sm"
        style={{
          backgroundColor: "var(--state-info-bg)",
          color: "var(--state-info-accent)",
          boxShadow: "inset 0 0 0 1px var(--state-info-border), var(--shadow-soft)",
        }}
      >
        <StepNumber n={step} />
      </div>
    );
  }
  return (
    <div
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
      style={{
        backgroundColor: "var(--surface-muted)",
        color: "var(--text-muted)",
        boxShadow: "inset 0 0 0 1px var(--surface-border-strong)",
      }}
    >
      <StepNumber n={step} />
    </div>
  );
}
