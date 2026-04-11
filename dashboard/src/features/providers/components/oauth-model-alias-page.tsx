"use client";

import Link from "next/link";
import { OAuthModelAliasEditor } from "@/components/providers/oauth-model-alias-editor";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";

export function OAuthModelAliasPage() {
  const { showToast } = useToast();
  const { user, isLoading } = useAuth();

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Providers", href: "/dashboard/providers" },
          { label: "Model Alias" },
        ]}
      />

      <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">Model Alias</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Review OAuth aliases in list or diagram mode. Provider mappings save directly to `config.yaml`, and list items can be expanded only when you need the details.
            </p>
          </div>

          <Link href="/dashboard/providers" className="dashboard-pill-link px-3 py-1.5 text-xs">
            Back to Providers
          </Link>
        </div>
      </section>

      {isLoading ? (
        <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-6 text-center text-sm text-[var(--text-muted)]">
          Loading access...
        </section>
      ) : !user?.isAdmin ? (
        <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-6 text-center text-sm text-[var(--text-muted)]">
          Model Alias is only available to admin users.
        </section>
      ) : (
        <OAuthModelAliasEditor showToast={showToast} />
      )}
    </div>
  );
}
