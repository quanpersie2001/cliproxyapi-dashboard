"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/config/config-fields";

interface ConfigPreviewProps {
  rawJson: string;
}

export default function ConfigPreview({ rawJson }: ConfigPreviewProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <section className="space-y-3 rounded-lg border border-[var(--state-danger-border)] bg-[var(--state-danger-bg)] p-4">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <SectionHeader title="Advanced: Raw JSON Editor" />
        <Button variant="ghost" onClick={() => setShowAdvanced((current) => !current)} className="text-xs">
          {showAdvanced ? "Hide" : "Show"} Raw JSON
        </Button>
      </div>

      {showAdvanced ? (
        <div className="space-y-4">
          <div className="rounded-md border border-[var(--state-danger-border)] bg-[var(--state-danger-bg)] p-3 text-sm text-[var(--state-danger-text)]">
            <strong>Warning:</strong>{" "}
            <span>
              This section shows the complete configuration including fields managed on other pages.
              Only edit this if you know what you&apos;re doing. Changes here are not saved from
              this editor.
            </span>
          </div>

          <textarea
            value={rawJson}
            readOnly
            spellCheck={false}
            className="h-96 w-full rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4 font-mono text-xs text-[var(--text-primary)] focus:outline-none"
          />

          <p className="text-xs text-[var(--text-muted)]">
            This is a read-only view of the full configuration. Use the structured forms above to
            make changes.
          </p>
        </div>
      ) : null}
    </section>
  );
}
