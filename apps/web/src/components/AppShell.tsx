import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, BookOpen, ChevronLeft, ClipboardCheck, FileText, Gauge, Menu, PackageSearch, Plus, Search, Settings, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../services/api";

const navigation = [
  ["/dashboard", "Dashboard", Gauge], ["/inspections", "Inspections", ClipboardCheck], ["/products", "Products", PackageSearch],
  ["/violations", "Violations", TriangleAlert], ["/reports", "Reports", FileText], ["/rules", "Rules", BookOpen], ["/settings", "Settings", Settings],
] as const;

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false); const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false); const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ inspections: Array<{ id: string; product_name: string }>; products: Array<{ id: string; name: string }>; violations: Array<{ id: string; inspection_id: string; requirement: string }> }>({ inspections: [], products: [], violations: [] });
  const inputRef = useRef<HTMLInputElement>(null); const navigate = useNavigate(); const location = useLocation();
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { if (searchOpen) inputRef.current?.focus(); }, [searchOpen]);
  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } if (event.key === "Escape") setSearchOpen(false); }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { if (query.trim().length >= 2) api.get<typeof results>(`/search?q=${encodeURIComponent(query)}`).then(setResults).catch(() => setResults({ inspections: [], products: [], violations: [] })); else setResults({ inspections: [], products: [], violations: [] }); }, 180); return () => window.clearTimeout(timer); }, [query]);
  const choose = (url: string) => { setSearchOpen(false); setQuery(""); navigate(url); };
  return <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`} aria-label="Primary navigation">
      <div className="brand"><span className="brand-mark"><ShieldCheck size={22} /></span><span className="brand-copy"><strong>MetrologyGuard</strong><small>Compliance Platform</small></span><button className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <nav>{navigation.map(([to, label, Icon]) => <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive || (to === "/inspections" && location.pathname.startsWith("/inspections")) ? "active" : ""}`} title={collapsed ? label : undefined}><Icon size={19} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="system-state"><span className="live-dot" />System operational</div><button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>{collapsed ? <Menu size={18} /> : <><ChevronLeft size={18} /><span>Collapse sidebar</span></>}</button></div>
    </aside>
    {mobileOpen && <button aria-label="Close navigation" className="mobile-backdrop" onClick={() => setMobileOpen(false)} />}
    <main className="main-column">
      <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><button className="global-search" onClick={() => setSearchOpen(true)}><Search size={18} /><span>Search inspections, products, violations…</span><kbd>Ctrl K</kbd></button><div className="topbar-actions"><Link to="/inspections/new" className="button primary compact"><Plus size={16} />New inspection</Link><button className="icon-button" aria-label="Notifications"><Bell size={19} /><span className="notification-dot" /></button><div className="user-avatar" aria-label="System Administrator">SA</div></div></header>
      <div className="content"><Outlet /></div>
    </main>
    {searchOpen && <div className="command-layer" role="dialog" aria-modal="true" aria-label="Global search"><button className="command-backdrop" aria-label="Close search" onClick={() => setSearchOpen(false)} /><div className="command-menu"><div className="command-input"><Search size={19} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search inspections, products, violations…" aria-label="Search" /><kbd>Esc</kbd></div>{query.trim().length < 2 ? <p className="command-hint">Enter at least two characters to search all compliance records.</p> : <div className="command-results">{results.inspections.length + results.products.length + results.violations.length === 0 && <p className="command-hint">No matching compliance records.</p>}{results.inspections.map((item) => <button key={item.id} onClick={() => choose(`/inspections/${item.id}`)}><ClipboardCheck size={16} /><span><b>{item.id}</b><small>{item.product_name}</small></span></button>)}{results.products.map((item) => <button key={item.id} onClick={() => choose(`/products/${item.id}`)}><PackageSearch size={16} /><span><b>{item.name}</b><small>Product repository</small></span></button>)}{results.violations.map((item) => <button key={item.id} onClick={() => choose(`/inspections/${item.inspection_id}`)}><TriangleAlert size={16} /><span><b>{item.requirement}</b><small>{item.inspection_id}</small></span></button>)}</div>}</div></div>}
  </div>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}
