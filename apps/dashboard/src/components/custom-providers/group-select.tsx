"use client";

interface GroupOption {
  id: string;
  name: string;
  color: string | null;
}

interface GroupSelectProps {
  groupId: string | null;
  groups: GroupOption[];
  saving: boolean;
  onGroupIdChange: (value: string | null) => void;
}

export function GroupSelect({
  groupId,
  groups,
  saving,
  onGroupIdChange,
}: GroupSelectProps) {
  return (
    <div>
      <label htmlFor="group-select" className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">
        Group (Optional)
      </label>
      <select
        id="group-select"
        value={groupId ?? ""}
        onChange={(e) => onGroupIdChange(e.target.value || null)}
        disabled={saving}
        className="w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus:border-[var(--state-info-border)] focus:outline-none focus:ring-1 focus:ring-[var(--state-info-border)]"
      >
        <option value="" className="bg-[var(--surface-base)] text-[var(--text-primary)]">No group</option>
        {groups.map(g => (
          <option key={g.id} value={g.id} className="bg-[var(--surface-base)] text-[var(--text-primary)]">{g.name}</option>
        ))}
      </select>
      <p className="mt-1.5 text-xs text-[var(--text-muted)]">Assign this provider to a group for organization</p>
    </div>
  );
}
