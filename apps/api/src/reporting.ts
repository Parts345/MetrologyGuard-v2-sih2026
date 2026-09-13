import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { db, id } from "./db.js";
import { reportPath } from "./config.js";

type Inspection = Record<string, unknown>;
const asText = (value: unknown) => value == null || value === "" ? "Not detected" : String(value);

function dataForReport(inspectionId: string) {
  const inspection = db.prepare("SELECT * FROM inspections WHERE id = ?").get(inspectionId) as Inspection | undefined;
  if (!inspection) throw new Error("Inspection not found");
  const rules = db.prepare("SELECT * FROM rule_results WHERE inspection_id = ? ORDER BY rule_code").all(inspectionId) as Inspection[];
  const violations = db.prepare("SELECT * FROM violations WHERE inspection_id = ? ORDER BY created_at").all(inspectionId) as Inspection[];
  const declarations = db.prepare("SELECT * FROM declarations WHERE inspection_id = ? ORDER BY label").all(inspectionId) as Inspection[];
  return { inspection, rules, violations, declarations };
}

export async function generateReport(inspectionId: string, format: "pdf" | "docx", actor = "usr-system") {
  const { inspection, rules, violations, declarations } = dataForReport(inspectionId);
  fs.mkdirSync(reportPath, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${inspectionId}-${stamp}.${format}`;
  const target = path.join(reportPath, filename);
  const title = "LEGAL METROLOGY COMPLIANCE REPORT";

  if (format === "pdf") {
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48, size: "A4", info: { Title: title, Author: "MetrologyGuard" } });
      const stream = fs.createWriteStream(target);
      doc.pipe(stream);
      doc.fillColor("#0F172A").fontSize(17).font("Helvetica-Bold").text(title);
      doc.moveDown(0.35).fillColor("#475569").fontSize(9).font("Helvetica").text("Automated evidence report — subject to authorised reviewer assessment");
      doc.moveDown();
      const fields = [
        ["Inspection ID", inspection.id], ["Product", inspection.product_name], ["Manufacturer", inspection.manufacturer],
        ["Inspection date", inspection.created_at], ["Automated status", inspection.automated_status], ["Compliance score", `${inspection.score ?? "—"} (${inspection.compliance_pct ?? 0}%)`],
        ["Model", `${inspection.model_name ?? "—"} v${inspection.model_version ?? "—"}`], ["Rule version", inspection.rule_version],
      ];
      fields.forEach(([label, value]) => { doc.fillColor("#334155").font("Helvetica-Bold").fontSize(9).text(`${label}: `, { continued: true }).font("Helvetica").text(asText(value)); });
      doc.moveDown().fillColor("#0F172A").font("Helvetica-Bold").fontSize(12).text("Extracted declarations");
      declarations.forEach((row) => doc.moveDown(0.2).fontSize(9).font("Helvetica-Bold").text(`${row.label}: `, { continued: true }).font("Helvetica").text(asText(row.value)));
      doc.moveDown().font("Helvetica-Bold").fontSize(12).text("Rule-by-rule validation");
      rules.forEach((row) => {
        doc.moveDown(0.3).fontSize(9).font("Helvetica-Bold").text(`${row.rule_code} — ${row.requirement}  [${row.status}]`);
        doc.font("Helvetica").fillColor("#475569").text(`Observed: ${asText(row.observed_value)} | Automated scope: ${row.evaluation_scope}`);
        doc.text(`Assessment: ${asText(row.reason)}`).fillColor("#0F172A");
      });
      doc.moveDown().font("Helvetica-Bold").fontSize(12).text("Violations");
      if (!violations.length) doc.font("Helvetica").fontSize(9).text("No automated violations were recorded.");
      violations.forEach((row, index) => doc.moveDown(0.2).font("Helvetica-Bold").fontSize(9).text(`${index + 1}. ${row.rule_code} — ${row.requirement} [${row.severity}]`).font("Helvetica").text(String(row.reason)));
      doc.moveDown().font("Helvetica-Bold").fontSize(12).text("Review record");
      doc.font("Helvetica").fontSize(9).text(`Reviewer status: ${inspection.review_status}\nReviewer notes: ${asText(inspection.reviewer_notes)}\nFinal status: ${inspection.final_status}`);
      doc.moveDown().fillColor("#64748B").fontSize(8).text("Traceability: this report retains the automated model decision, model version, rule version and inspection timestamp. Font-size and placement are not evaluated by the supplied model.");
      doc.end();
      stream.on("finish", resolve); stream.on("error", reject);
    });
  } else {
    const cell = (text: unknown) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: asText(text), size: 18 })] })] });
    const doc = new Document({ sections: [{ children: [
      new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 32, color: "0F172A" })] }),
      new Paragraph({ text: "Automated evidence report — subject to authorised reviewer assessment." }),
      new Paragraph({ text: "Inspection metadata", heading: "Heading1" }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
        ["Inspection ID", inspection.id], ["Product", inspection.product_name], ["Manufacturer", inspection.manufacturer], ["Automated status", inspection.automated_status], ["Compliance score", `${inspection.score ?? "—"} (${inspection.compliance_pct ?? 0}%)`], ["Model", `${inspection.model_name ?? "—"} v${inspection.model_version ?? "—"}`], ["Rule version", inspection.rule_version],
      ].map(([a, b]) => new TableRow({ children: [cell(a), cell(b)] })) }),
      new Paragraph({ text: "Extracted declarations", heading: "Heading1" }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [cell("Requirement"), cell("Observed value"), cell("Status")] }), ...declarations.map((d) => new TableRow({ children: [cell(d.label), cell(d.value), cell(d.detected ? "Detected" : "Not detected")] }))] }),
      new Paragraph({ text: "Rule-by-rule validation", heading: "Heading1" }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [cell("Rule"), cell("Requirement"), cell("Observed"), cell("Status")] }), ...rules.map((r) => new TableRow({ children: [cell(r.rule_code), cell(r.requirement), cell(r.observed_value), cell(r.status)] }))] }),
      new Paragraph({ text: "Violations", heading: "Heading1" }),
      ...((violations.length ? violations : [{ rule_code: "—", requirement: "No automated violations", reason: "No automated violations were recorded." }]).map((v) => new Paragraph({ text: `${v.rule_code}: ${v.requirement} — ${v.reason}` }))),
      new Paragraph({ text: "Review record", heading: "Heading1" }), new Paragraph({ text: `Reviewer status: ${inspection.review_status}\nReviewer notes: ${asText(inspection.reviewer_notes)}\nFinal status: ${inspection.final_status}` }),
      new Paragraph({ text: "Note: font-size and placement checks are not evaluated by the supplied model and require manual review." }),
    ] }] });
    fs.writeFileSync(target, await Packer.toBuffer(doc));
  }
  db.prepare("INSERT INTO reports (id, inspection_id, format, storage_key, generated_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id("rpt"), inspectionId, format.toUpperCase(), filename, actor, new Date().toISOString());
  return { filename, url: `/reports/${filename}` };
}
