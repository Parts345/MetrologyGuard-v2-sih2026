import { CheckCircle2, Clock3, AlertTriangle, XCircle, LoaderCircle } from "lucide-react";
import type { Status } from "../types";

const definitions: Record<Status, { label: string; icon: typeof CheckCircle2; className: string }> = {
  COMPLIANT: { label: "Compliant", icon: CheckCircle2, className: "status-compliant" },
  PARTIAL: { label: "Partial", icon: AlertTriangle, className: "status-partial" },
  NON_COMPLIANT: { label: "Non-compliant", icon: XCircle, className: "status-noncompliant" },
  PENDING: { label: "Pending", icon: Clock3, className: "status-pending" },
  ANALYZING: { label: "Analyzing", icon: LoaderCircle, className: "status-pending" },
};
export function StatusBadge({ status, compact = false }: { status: Status; compact?: boolean }) {
  const item = definitions[status] ?? definitions.PENDING; const Icon = item.icon;
  return <span className={`status-badge ${item.className}`}><Icon size={compact ? 14 : 15} aria-hidden="true" />{item.label}</span>;
}
