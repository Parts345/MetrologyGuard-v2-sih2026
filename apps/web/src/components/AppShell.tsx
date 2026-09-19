import { useEffect, useRef, useState, type ReactNode } from "react";
import { Accessibility, Bell, CalendarDays, ClipboardCheck, FileText, Gauge, GitCompare, Menu, Moon, PackageSearch, Plus, Search, Settings, ShieldCheck, Sun, TriangleAlert, Home } from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { applyAccessibility, broadcastPreferences, defaultAccessibility, readPreferences, readTheme, setDocumentTheme, setThemePreference, type AccessibilityPreferences, type ThemePreference } from "../preferences";

const navigationSections = [
  { label: "Home", items: [["/", "Home", Home]] },
  { label: "Inspect", items: [["/inspect", "New inspection", Plus], ["/inspections", "Inspection history", ClipboardCheck], ["/calendar", "Calendar", CalendarDays]] },
  { label: "Analyze", items: [["/compare", "Compare", GitCompare], ["/violations", "Violations", TriangleAlert], ["/reports", "Reports", FileText]] },
  { label: "System", items: [["/settings", "Settings", Settings]] },
] as const;

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false); const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false); const [accessibilityOpen, setAccessibilityOpen] = useState(false); const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ inspections: Array<{ id: string; product_name: string }>; products: Array<{ id: string; name: string }>; violations: Array<{ id: string; inspection_id: string; requirement: string }> }>({ inspections: [], products: [], violations: [] });
  const inputRef = useRef<HTMLInputElement>(null); const navigate = useNavigate(); const location = useLocation();
  const [theme, setTheme] = useState<ThemePreference>(readTheme);
  const [accessibility, setAccessibility] = useState<AccessibilityPreferences>(() => readPreferences("metrologyguard-accessibility", defaultAccessibility));
  useEffect(() => { setDocumentTheme(theme); localStorage.setItem("metrologyguard-theme", theme); }, [theme]);
  useEffect(() => { applyAccessibility(accessibility); localStorage.setItem("metrologyguard-accessibility", JSON.stringify(accessibility)); }, [accessibility]);
  useEffect(() => { const syncPreferences = () => { setTheme(readTheme()); setAccessibility(readPreferences("metrologyguard-accessibility", defaultAccessibility)); }; window.addEventListener("metrologyguard-preferences-change", syncPreferences); return () => window.removeEventListener("metrologyguard-preferences-change", syncPreferences); }, []);
  useEffect(() => { const syncSystemTheme = () => { if (readTheme() === "system") setDocumentTheme("system"); }; const query = window.matchMedia("(prefers-color-scheme: dark)"); query.addEventListener("change", syncSystemTheme); return () => query.removeEventListener("change", syncSystemTheme); }, []);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { if (searchOpen) inputRef.current?.focus(); }, [searchOpen]);
  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } if (event.key === "Escape") setSearchOpen(false); }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { if (query.trim().length >= 2) api.get<typeof results>(`/search?q=${encodeURIComponent(query)}`).then(setResults).catch(() => setResults({ inspections: [], products: [], violations: [] })); else setResults({ inspections: [], products: [], violations: [] }); }, 180); return () => window.clearTimeout(timer); }, [query]);
  const choose = (url: string) => { setSearchOpen(false); setQuery(""); navigate(url); };
  const toggleAccessibility = (key: keyof AccessibilityPreferences) => { const next = { ...accessibility, [key]: !accessibility[key] }; setAccessibility(next); localStorage.setItem("metrologyguard-accessibility", JSON.stringify(next)); applyAccessibility(next); broadcastPreferences(); };
  const toggleNavigation = () => { if (window.matchMedia("(max-width: 870px)").matches) setMobileOpen((open) => !open); else setCollapsed((value) => !value); };
  const isDarkTheme = theme === "dark" || (theme === "system" && document.documentElement.dataset.theme === "dark");
  const isActiveRoute = (to: string) => to === "/inspect"
    ? location.pathname === "/inspect" || location.pathname === "/inspections/new"
    : to === "/inspections"
      ? location.pathname === "/inspections" || /^\/inspections\/[^/]+$/.test(location.pathname) && location.pathname !== "/inspections/new"
      : location.pathname === to;
  return <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`} aria-label="Primary navigation">
      <button className="icon-button sidebar-menu" aria-label={mobileOpen ? "Close navigation" : collapsed ? "Expand navigation" : "Collapse navigation"} onClick={toggleNavigation}><Menu size={20} /></button>
      <nav>{navigationSections.map((section) => <div className="nav-section" key={section.label}><span className="nav-section-label">{section.label}</span>{section.items.map(([to, label, Icon]) => <NavLink end key={to} to={to} className={`nav-item ${isActiveRoute(to) ? "active" : ""}`} title={collapsed ? label : undefined}><Icon size={19} /><span>{label}</span></NavLink>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="system-state"><span className="live-dot" />System operational</div></div>
    </aside>
    {mobileOpen && <button aria-label="Close navigation" className="mobile-backdrop" onClick={() => setMobileOpen(false)} />}
    <main className="main-column">
      <header className="topbar"><div className="header-leading"><Link to="/" className="header-brand"><span className="brand-mark"><ShieldCheck size={21} /></span><strong>MetrologyGuard</strong></Link></div><button className="global-search" onClick={() => setSearchOpen(true)}><Search size={18} /><span>Search inspections, products, violations…</span><kbd>Ctrl K</kbd></button><div className="topbar-actions"><button className="theme-toggle" onClick={() => { const next = isDarkTheme ? "light" : "dark"; setThemePreference(next); setTheme(next); }} aria-label={`Switch to ${isDarkTheme ? "light" : "dark"} theme`} title={`Switch to ${isDarkTheme ? "light" : "dark"} theme`}>{isDarkTheme ? <Sun size={17} /> : <Moon size={17} />}</button><div className="accessibility-menu"><button className="icon-button" aria-label="Accessibility preferences" aria-expanded={accessibilityOpen} onClick={() => setAccessibilityOpen((open) => !open)}><Accessibility size={19} /></button>{accessibilityOpen && <div className="accessibility-popover"><b>Accessibility</b>{([["largerText", "Larger text"], ["highContrast", "High contrast"], ["largerButtons", "Larger buttons"], ["reducedMotion", "Reduced motion"]] as const).map(([key, label]) => <button key={key} onClick={() => toggleAccessibility(key)}><span>{label}</span><small>{accessibility[key] ? "ON" : "OFF"}</small></button>)}<Link to="/settings" onClick={() => setAccessibilityOpen(false)}>Open Settings <span>→</span></Link></div>}</div><Link to="/inspections/new" className="button primary compact"><Plus size={16} />New inspection</Link><button className="icon-button" aria-label="Notifications"><Bell size={19} /><span className="notification-dot" /></button><div className="user-avatar" aria-label="System Administrator">SA</div></div></header>
      <div className="content"><Outlet /></div>
    </main>
    {searchOpen && <div className="command-layer" role="dialog" aria-modal="true" aria-label="Global search"><button className="command-backdrop" aria-label="Close search" onClick={() => setSearchOpen(false)} /><div className="command-menu"><div className="command-input"><Search size={19} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search inspections, products, violations…" aria-label="Search" /><kbd>Esc</kbd></div>{query.trim().length < 2 ? <p className="command-hint">Enter at least two characters to search all compliance records.</p> : <div className="command-results">{results.inspections.length + results.products.length + results.violations.length === 0 && <p className="command-hint">No matching compliance records.</p>}{results.inspections.map((item) => <button key={item.id} onClick={() => choose(`/inspections/${item.id}`)}><ClipboardCheck size={16} /><span><b>{item.id}</b><small>{item.product_name}</small></span></button>)}{results.products.map((item) => <button key={item.id} onClick={() => choose(`/products/${item.id}`)}><PackageSearch size={16} /><span><b>{item.name}</b><small>Product repository</small></span></button>)}{results.violations.map((item) => <button key={item.id} onClick={() => choose(`/inspections/${item.inspection_id}`)}><TriangleAlert size={16} /><span><b>{item.requirement}</b><small>{item.inspection_id}</small></span></button>)}</div>}</div></div>}
  </div>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}
