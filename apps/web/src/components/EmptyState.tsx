import { ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
export function EmptyState({ title = "No records found", message = "There are no records matching the current view.", action = false }: { title?: string; message?: string; action?: boolean }) {
  return <div className="empty-state"><ClipboardList size={28} aria-hidden="true" /><h3>{title}</h3><p>{message}</p>{action && <Link to="/inspections/new" className="button primary">New inspection</Link>}</div>;
}
