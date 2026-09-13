import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { InspectionDetailPage } from "./pages/InspectionDetailPage";
import { InspectionsPage } from "./pages/InspectionsPage";
import { LoginPage } from "./pages/LoginPage";
import { NewInspectionPage } from "./pages/NewInspectionPage";
import { ProductDetailPage, ProductsPage, ReportsPage, RulesPage, SettingsPage, ViolationsPage } from "./pages/RepositoryPages";

function MissingPage() { return <div className="empty-state"><h3>Page not found</h3><p>The requested compliance record or page is unavailable.</p></div>; }
export default function App() { return <Routes><Route path="/login" element={<LoginPage />} /><Route element={<AppShell />}><Route path="/dashboard" element={<DashboardPage />} /><Route path="/inspections" element={<InspectionsPage />} /><Route path="/inspections/new" element={<NewInspectionPage />} /><Route path="/inspections/:id" element={<InspectionDetailPage />} /><Route path="/products" element={<ProductsPage />} /><Route path="/products/:id" element={<ProductDetailPage />} /><Route path="/violations" element={<ViolationsPage />} /><Route path="/reports" element={<ReportsPage />} /><Route path="/rules" element={<RulesPage />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/" element={<Navigate to="/dashboard" replace />} /><Route path="*" element={<MissingPage />} /></Route></Routes>; }
