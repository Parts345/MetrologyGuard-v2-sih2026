import { useEffect, useState } from "react";
import { ArrowUpRight, ClipboardCheck, ShieldCheck, TriangleAlert } from "lucide-react";
import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/AppShell";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../services/api";
import type { Status } from "../types";
import { formatDate } from "../utils";

type Summary = { kpis: { totalInspections: number; compliant: number; partial: number; nonCompliant: number; violationRate: number; reportsGenerated: number }; distribution: Array<{ name: string; value: number }>; violationCategories: Array<{ label: string; value: number }>; recent: Array<{ id: string; product_name: string; created_at: string; status: Status; score: string; inspector_name: string; violations: number }> };
type Trend = { items: Array<{ date: string; inspections: number; nonCompliant: number }> };
const palette = ["#16a34a", "#d97706", "#dc2626"];

export function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null); const [trends, setTrends] = useState<Trend>({ items: [] }); const [error, setError] = useState("");
  useEffect(() => { Promise.all([api.get<Summary>("/dashboard/summary"), api.get<Trend>("/dashboard/trends")]).then(([s, t]) => { setSummary(s); setTrends(t); }).catch((e: Error) => setError(e.message)); }, []);
  if (error) return <div className="alert error">{error}</div>;
  if (!summary) return <DashboardSkeleton />;
  const cards = [
    ["Total inspections", summary.kpis.totalInspections, ClipboardCheck, "neutral"], ["Compliant", summary.kpis.compliant, ShieldCheck, "success"], ["Non-compliant", summary.kpis.nonCompliant, TriangleAlert, "danger"], ["Needs review", summary.kpis.partial, ArrowUpRight, "warning"],
  ] as const;
  return <>
    <PageHeader eyebrow="Inspection command center" title="What is happening with inspections?" description="A focused view of current activity, compliance outcomes, and follow-up work." actions={<Link className="button primary" to="/inspections/new">New inspection</Link>} />
    <section className="kpi-grid">{cards.map(([label, value, Icon, tone]) => <article className="kpi-card" key={label}><div className={`kpi-icon ${tone}`}><Icon size={19} /></div><p>{label}</p><strong>{value}</strong></article>)}</section>
    {summary.kpis.totalInspections === 0 ? <EmptyState title="No inspections yet" message="Start a new inspection to begin analysing packaged commodities." action /> : <>
      <section className="dashboard-grid analytics"><article className="panel chart-panel"><div className="panel-title"><div><h2>Compliance distribution</h2><p>Automated assessment outcomes</p></div></div><div className="donut-layout"><ResponsiveContainer width="58%" height={220}><PieChart><Pie data={summary.distribution} dataKey="value" nameKey="name" innerRadius={58} outerRadius={85} paddingAngle={3}>{summary.distribution.map((item, i) => <Cell key={item.name} fill={palette[i]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="chart-legend">{summary.distribution.map((item, index) => <div key={item.name}><span style={{ background: palette[index] }} /><b>{item.value}</b><small>{item.name}</small></div>)}</div></div></article>
      <article className="panel chart-panel"><div className="panel-title"><div><h2>Inspection trend</h2><p>Daily inspection volume</p></div></div><ResponsiveContainer width="100%" height={220}><LineChart data={trends.items}><XAxis dataKey="date" tickFormatter={(x) => x.slice(5)} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip /><Line dataKey="inspections" type="monotone" stroke="#1e40af" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></article></section>
      <section className="dashboard-grid lower"><article className="panel chart-panel"><div className="panel-title"><div><h2>Violation categories</h2><p>Missing declarations by requirement</p></div></div><ResponsiveContainer width="100%" height={250}><BarChart data={summary.violationCategories} layout="vertical" margin={{ left: 10 }}><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="label" width={112} tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" fill="#1e40af" radius={[3, 3, 3, 3]} /></BarChart></ResponsiveContainer></article>
      <article className="panel"><div className="panel-title"><div><h2>Evidence boundary</h2><p>Automated checks and review controls</p></div></div><div className="boundary-list"><div><ShieldCheck size={18} /><span><b>Automated presence checks</b><small>Six supported declaration checks are evaluated from the supplied model output.</small></span></div><div><TriangleAlert size={18} /><span><b>Manual review retained</b><small>Font-size, placement and statutory presentation are explicitly not evaluated.</small></span></div><div><ClipboardCheck size={18} /><span><b>Traceability preserved</b><small>OCR regions, model version, rule version and reviewer outcomes are recorded.</small></span></div></div></article></section>
      <section className="panel recent-panel"><div className="panel-title"><div><h2>Recent inspections</h2><p>Latest compliance assessments</p></div><Link to="/inspections" className="text-button">View all</Link></div><div className="table-scroll"><table><thead><tr><th>Inspection ID</th><th>Product</th><th>Date</th><th>Status</th><th>Score</th><th>Violations</th><th>Inspector</th><th /></tr></thead><tbody>{summary.recent.map((row) => <tr key={row.id}><td className="mono">{row.id}</td><td><b>{row.product_name}</b></td><td>{formatDate(row.created_at)}</td><td><StatusBadge status={row.status} compact /></td><td>{row.score ?? "—"}</td><td>{row.violations}</td><td>{row.inspector_name}</td><td><Link className="table-link" to={`/inspections/${row.id}`}>Open</Link></td></tr>)}</tbody></table></div></section>
    </>}
  </>;
}

function DashboardSkeleton() { return <><PageHeader eyebrow="Operational overview" title="Compliance dashboard" description="Loading compliance activity…" /><div className="kpi-grid">{Array.from({ length: 6 }, (_, i) => <div className="skeleton kpi-skeleton" key={i} />)}</div><div className="dashboard-grid analytics"><div className="skeleton chart-skeleton" /><div className="skeleton chart-skeleton" /></div></>; }
