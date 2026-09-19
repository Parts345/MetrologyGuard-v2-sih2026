import { ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, FileSearch, ScanLine, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/AppShell";

const steps = [
  ["01", "Upload", "Add a clear package label image."],
  ["02", "OCR", "Read visible declarations with the model."],
  ["03", "Extract", "Turn label text into structured fields."],
  ["04", "Validate", "Evaluate the supported legal metrology rules."],
  ["05", "Report", "Review evidence and export the assessment."],
] as const;
const capabilities = [
  [ScanLine, "AI-powered OCR", "Capture text regions and confidence directly from the package image."],
  [FileSearch, "Declaration extraction", "See which required declarations were detected and what was observed."],
  [ShieldCheck, "Rule validation", "Keep automated outcomes, reviewer decisions, and rule versions traceable."],
  [CheckCircle2, "Evidence-led follow-up", "Understand every missing declaration before taking action."],
] as const;

export function HomePage() {
  return <div className="home-page">
    <section className="home-hero">
      <div className="home-hero-copy">
        <p className="eyebrow"><Sparkles size={14} /> Legal metrology × artificial intelligence</p>
        <h1>Inspect. Verify. Comply.</h1>
        <p className="home-lead">AI-powered packaged commodity inspection and compliance verification for evidence-led teams.</p>
        <div className="home-actions"><Link className="button primary" to="/inspections/new">Start inspection <ArrowRight size={16} /></Link><Link className="button secondary" to="/inspections">View inspections</Link></div>
        <div className="home-trust"><span><ShieldCheck size={15} /> Evidence preserved</span><span><ClipboardCheck size={15} /> Review-ready records</span></div>
      </div>
      <div className="workflow-board" aria-label="Inspection workflow">
        <div className="workflow-board-heading"><span>Inspection workflow</span><span className="live-pill"><i /> Ready</span></div>
        {steps.map(([number, title, copy], index) => <div className="workflow-row" key={title}><span className="workflow-number">{number}</span><div><b>{title}</b><small>{copy}</small></div>{index < steps.length - 1 && <ArrowRight className="workflow-arrow" size={16} />}</div>)}
      </div>
    </section>
    <section className="home-section"><PageHeader eyebrow="Built for the inspection desk" title="From package image to accountable decision" description="A focused workspace for the work that matters: inspect, validate, explain, and act." /><div className="capability-grid">{capabilities.map(([Icon, title, copy]) => <article className="capability" key={title}><span className="capability-icon"><Icon size={20} /></span><h2>{title}</h2><p>{copy}</p></article>)}</div></section>
    <section className="home-band"><div><p className="eyebrow">Keep the record moving</p><h2>Every inspection becomes a searchable, reviewable record.</h2></div><div className="home-band-links"><Link to="/calendar"><CalendarDays size={17} /> Inspection calendar <ArrowRight size={15} /></Link><Link to="/reports"><FileSearch size={17} /> Compliance reports <ArrowRight size={15} /></Link></div></section>
  </div>;
}
