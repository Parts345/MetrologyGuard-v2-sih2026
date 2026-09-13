import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import { z } from "zod";
import { config, reportPath, uploadPath } from "./config.js";
import { audit, db, id } from "./db.js";
import { generateReport } from "./reporting.js";
import { RULES, ruleForKey } from "./rules.js";

fs.mkdirSync(uploadPath, { recursive: true });
fs.mkdirSync(reportPath, { recursive: true });

type Role = "Administrator" | "Enforcement Officer" | "Reviewer" | "Read Only";
type RequestUser = { id: string; name: string; role: Role };
type MlRule = { passed?: boolean; value?: string | null };
type MlResult = {
  status: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT";
  score: string; compliance_pct: number; device?: string; latency_ms?: number; boxes_count?: number;
  declarations?: Record<string, MlRule>; raw_boxes?: Array<{ text?: string; confidence?: number; polygon?: unknown }>;
  model?: { name?: string; version?: string; engine?: string; rule_version?: string };
};

declare global { namespace Express { interface Request { user?: RequestUser } } }

const app = express();
const storageDir = path.resolve(process.env.STORAGE_PATH || path.resolve(process.cwd(), "storage"));
app.use("/storage", express.static(storageDir));

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: config.webOrigin.split(",").map((origin) => origin.trim()), credentials: false }));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false }));

// Authentication adapter boundary. Development uses a local administrator identity.
// Production refuses client-supplied roles unless a trusted identity proxy is enabled.
app.use((req, _res, next) => {
  const role = req.header("x-user-role") as Role | undefined;
  const permitted: Role[] = ["Administrator", "Enforcement Officer", "Reviewer", "Read Only"];
  if (config.environment === "production" && !config.trustIdentityProxy) {
    return next(Object.assign(new Error("An identity provider must be configured before this production API can accept requests."), { status: 503 }));
  }
  if (config.environment === "production" && (!role || !permitted.includes(role))) {
    return next(Object.assign(new Error("Authentication is required."), { status: 401 }));
  }
  req.user = { id: req.header("x-user-id") ?? "usr-system", name: req.header("x-user-name") ?? "System Administrator", role: permitted.includes(role ?? "Administrator") ? role ?? "Administrator" : "Read Only" };
  next();
});

function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return next(Object.assign(new Error("You do not have permission to perform this action."), { status: 403 }));
    next();
  };
}

function inspectionOr404(inspectionId: string) {
  const inspection = db.prepare("SELECT * FROM inspections WHERE id = ?").get(inspectionId) as Record<string, unknown> | undefined;
  if (!inspection) throw Object.assign(new Error("Inspection not found."), { status: 404 });
  return inspection;
}
function routeParam(req: Request, name: string) {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function apiError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function signatureMatches(filePath: string, mimetype: string) {
  const signature = fs.readFileSync(filePath).subarray(0, 12);
  const jpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  const png = signature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = signature.subarray(0, 4).toString() === "RIFF" && signature.subarray(8, 12).toString() === "WEBP";
  return (mimetype === "image/jpeg" && jpeg) || (mimetype === "image/png" && png) || (mimetype === "image/webp" && webp);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadPath),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${file.mimetype === "image/png" ? ".png" : file.mimetype === "image/webp" ? ".webp" : ".jpg"}`),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});

const inspectionSchema = z.object({
  productName: z.string().trim().min(2).max(160),
  manufacturer: z.string().trim().max(160).optional().default(""),
  category: z.string().trim().max(100).optional().default(""),
});
const reviewSchema = z.object({
  reviewStatus: z.enum(["PENDING", "APPROVED", "FURTHER_REVIEW"]),
  finalStatus: z.enum(["PENDING", "COMPLIANT", "PARTIAL", "NON_COMPLIANT"]).optional(),
  reviewerNotes: z.string().trim().max(4000).optional().default(""),
});

app.get("/api/health", async (_req, res) => {
  try {
    const response = await fetch(`${config.mlServiceUrl}/health`, { signal: AbortSignal.timeout(2500) });
    res.json({ api: "ready", database: "ready", ml: await response.json() });
  } catch {
    res.json({ api: "ready", database: "ready", ml: { ready: false, error: "ML service unreachable" } });
  }
});

app.post("/api/inspections", requireRole("Administrator", "Enforcement Officer"), (req, res, next) => {
  try {
    const data = inspectionSchema.parse(req.body);
    const product = db.prepare("SELECT * FROM products WHERE lower(name) = lower(?) AND lower(COALESCE(manufacturer, '')) = lower(?) LIMIT 1").get(data.productName, data.manufacturer) as { id: string } | undefined;
    const productId = product?.id ?? id("prd");
    const inspectionId = `INS-${new Date().getFullYear()}-${String((db.prepare("SELECT COUNT(*) AS total FROM inspections").get() as { total: number }).total + 1).padStart(5, "0")}`;
    const createdAt = new Date().toISOString();
    const create = db.transaction(() => {
      if (!product) db.prepare("INSERT INTO products (id, name, category, manufacturer, created_at) VALUES (?, ?, ?, ?, ?)").run(productId, data.productName, data.category || null, data.manufacturer || null, createdAt);
      db.prepare("INSERT INTO inspections (id, product_id, product_name, manufacturer, category, inspector_id, inspector_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(inspectionId, productId, data.productName, data.manufacturer || null, data.category || null, req.user!.id, req.user!.name, createdAt);
      audit("Inspection Created", inspectionId, req.user!.id, undefined, data);
    });
    create();
    res.status(201).json({ id: inspectionId, status: "PENDING", message: "Inspection created. Upload a package image to continue." });
  } catch (error) { next(error); }
});

app.post("/api/inspections/:id/images", requireRole("Administrator", "Enforcement Officer"), (req, _res, next) => { try { inspectionOr404(routeParam(req, "id")); next(); } catch (error) { next(error); } }, upload.single("image"), (req, res, next) => {
  try {
    if (!req.file) return apiError(res, 400, "IMAGE_REQUIRED", "Select a JPEG, PNG, or WebP package image.");
    if (!signatureMatches(req.file.path, req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return apiError(res, 422, "INVALID_IMAGE", "The file content does not match the declared image format.");
    }
    const imageId = id("img");
    db.prepare("INSERT INTO inspection_images (id, inspection_id, original_name, storage_key, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(imageId, req.params.id, path.basename(req.file.originalname).slice(0, 255), req.file.filename, req.file.mimetype, req.file.size, new Date().toISOString());
    audit("Image Uploaded", routeParam(req, "id"), req.user!.id, undefined, { imageId, name: req.file.originalname, size: req.file.size });
    res.status(201).json({ id: imageId, name: req.file.originalname, sizeBytes: req.file.size, mimeType: req.file.mimetype, url: `/uploads/${req.file.filename}` });
  } catch (error) { next(error); }
});

app.post("/api/inspections/:id/analyze", requireRole("Administrator", "Enforcement Officer"), async (req, res, next) => {
  try {
    const inspectionId = routeParam(req, "id");
    const inspection = inspectionOr404(inspectionId);
    const image = db.prepare("SELECT * FROM inspection_images WHERE inspection_id = ? ORDER BY created_at DESC LIMIT 1").get(req.params.id) as Record<string, string> | undefined;
    if (!image) return apiError(res, 409, "IMAGE_REQUIRED", "Upload a package image before starting analysis.");
    const inputPath = path.join(uploadPath, image.storage_key);
    if (!fs.existsSync(inputPath)) return apiError(res, 410, "IMAGE_UNAVAILABLE", "The uploaded image is no longer available.");
    db.prepare("UPDATE inspections SET analysis_started_at = ?, status = 'ANALYZING' WHERE id = ?").run(new Date().toISOString(), req.params.id);
    audit("Analysis Started", inspectionId, req.user!.id);
    const payload = new FormData();
    payload.append("image", new Blob([await fsp.readFile(inputPath)], { type: image.mime_type }), image.original_name);
    let response: globalThis.Response;
    try {
      response = await fetch(`${config.mlServiceUrl}/predict`, { method: "POST", body: payload, signal: AbortSignal.timeout(120_000) });
    } catch {
      db.prepare("UPDATE inspections SET status = 'PENDING' WHERE id = ?").run(req.params.id);
      return apiError(res, 503, "ML_UNAVAILABLE", "The analysis engine is unavailable. Please try again shortly.");
    }
    const body = await response.json().catch(() => ({})) as MlResult & { detail?: string };
    if (!response.ok) {
      db.prepare("UPDATE inspections SET status = 'PENDING' WHERE id = ?").run(req.params.id);
      return apiError(res, response.status === 503 ? 503 : 422, "ANALYSIS_FAILED", body.detail ?? "Image analysis could not be completed.");
    }
    const result = body;
    if (!["COMPLIANT", "PARTIAL", "NON_COMPLIANT"].includes(result.status)) throw new Error("The model returned an invalid compliance status.");
    const saveAnalysis = db.transaction(() => {
      db.prepare("DELETE FROM ocr_results WHERE inspection_id = ?").run(req.params.id);
      db.prepare("DELETE FROM declarations WHERE inspection_id = ?").run(req.params.id);
      db.prepare("DELETE FROM rule_results WHERE inspection_id = ?").run(req.params.id);
      db.prepare("DELETE FROM violations WHERE inspection_id = ?").run(req.params.id);
      db.prepare("UPDATE inspections SET status = ?, automated_status = ?, score = ?, compliance_pct = ?, analyzed_at = ?, model_name = ?, model_version = ?, rule_version = ?, device = ?, latency_ms = ? WHERE id = ?")
        .run(result.status, result.status, result.score, result.compliance_pct, new Date().toISOString(), result.model?.name ?? null, result.model?.version ?? null, result.model?.rule_version ?? null, result.device ?? null, result.latency_ms ?? null, req.params.id);
      const boxes = result.raw_boxes ?? [];
      const fullText = boxes.map((box) => box.text ?? "").filter(Boolean).join("\n");
      db.prepare("INSERT INTO ocr_results (id, inspection_id, raw_boxes_json, boxes_count, full_text, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id("ocr"), req.params.id, JSON.stringify(boxes), result.boxes_count ?? boxes.length, fullText, new Date().toISOString());
      for (const rule of RULES) {
        const modelRule = result.declarations?.[rule.key] ?? { passed: false, value: null };
        const passed = Boolean(modelRule.passed);
        const observed = modelRule.value ?? null;
        const status = passed ? "PASS" : "FAIL";
        const reason = passed ? "Mandatory declaration detected by the supplied OCR model." : "Mandatory declaration was not detected by the supplied OCR model.";
        db.prepare("INSERT INTO declarations (id, inspection_id, rule_key, label, value, detected, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(id("dec"), req.params.id, rule.key, rule.requirement, observed, passed ? 1 : 0, new Date().toISOString());
        db.prepare("INSERT INTO rule_results (id, inspection_id, rule_key, rule_code, requirement, observed_value, status, evaluation_scope, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(id("rr"), req.params.id, rule.key, rule.code, rule.requirement, observed, status, rule.automatedCheck, reason, new Date().toISOString());
        if (!passed) db.prepare("INSERT INTO violations (id, inspection_id, rule_key, rule_code, requirement, observed_value, reason, severity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?)")
          .run(id("vio"), req.params.id, rule.key, rule.code, rule.requirement, observed, reason, result.status === "NON_COMPLIANT" ? "High" : "Medium", new Date().toISOString());
      }
      audit("Analysis Completed", inspectionId, req.user!.id, { status: inspection.status }, { status: result.status, score: result.score, compliancePct: result.compliance_pct }, { boxesCount: result.boxes_count, device: result.device });
    });
    saveAnalysis();
    res.json({ inspectionId: req.params.id, status: result.status, score: result.score, compliancePct: result.compliance_pct, message: "Analysis completed. Compliance assessment is ready for review." });
  } catch (error) { next(error); }
});

app.get("/api/inspections", (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    const conditions: string[] = []; const values: unknown[] = [];
    if (search) { conditions.push("(i.id LIKE ? OR i.product_name LIKE ? OR i.manufacturer LIKE ?)"); values.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (["COMPLIANT", "PARTIAL", "NON_COMPLIANT", "PENDING", "ANALYZING"].includes(status)) { conditions.push("i.status = ?"); values.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = (db.prepare(`SELECT COUNT(*) AS total FROM inspections i ${where}`).get(...values) as { total: number }).total;
    const items = db.prepare(`SELECT i.*, COUNT(v.id) AS violation_count, (SELECT storage_key FROM inspection_images WHERE inspection_id = i.id ORDER BY created_at DESC LIMIT 1) AS image_key FROM inspections i LEFT JOIN violations v ON v.inspection_id = i.id ${where} GROUP BY i.id ORDER BY i.created_at DESC LIMIT ? OFFSET ?`).all(...values, pageSize, (page - 1) * pageSize);
    res.json({ items: (items as Record<string, unknown>[]).map((item) => ({ ...item, imageUrl: item.image_key ? `/uploads/${item.image_key}` : null })), pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
  } catch (error) { next(error); }
});

app.get("/api/inspections/:id", (req, res, next) => {
  try {
    const inspection = inspectionOr404(req.params.id);
    const images = db.prepare("SELECT id, original_name, storage_key, mime_type, size_bytes, width, height, created_at FROM inspection_images WHERE inspection_id = ? ORDER BY created_at").all(req.params.id) as Record<string, unknown>[];
    const ocr = db.prepare("SELECT * FROM ocr_results WHERE inspection_id = ?").get(req.params.id) as Record<string, string> | undefined;
    const declarations = db.prepare("SELECT * FROM declarations WHERE inspection_id = ? ORDER BY label").all(req.params.id);
    const ruleResults = db.prepare("SELECT * FROM rule_results WHERE inspection_id = ? ORDER BY rule_code").all(req.params.id);
    const violations = db.prepare("SELECT * FROM violations WHERE inspection_id = ? ORDER BY created_at").all(req.params.id);
    const reports = db.prepare("SELECT * FROM reports WHERE inspection_id = ? ORDER BY created_at DESC").all(req.params.id) as Record<string, unknown>[];
    const auditLogs = db.prepare("SELECT * FROM audit_logs WHERE inspection_id = ? ORDER BY created_at DESC").all(req.params.id);
    res.json({ inspection, images: images.map((image) => ({ ...image, url: `/uploads/${image.storage_key}` })), ocr: ocr ? { ...ocr, rawBoxes: JSON.parse(ocr.raw_boxes_json) } : null, declarations, ruleResults, violations, reports: reports.map((report) => ({ ...report, url: `/reports/${report.storage_key}` })), auditLogs });
  } catch (error) { next(error); }
});

app.patch("/api/inspections/:id/review", requireRole("Administrator", "Reviewer", "Enforcement Officer"), (req, res, next) => {
  try {
    const inspectionId = routeParam(req, "id");
    const before = inspectionOr404(inspectionId);
    const review = reviewSchema.parse(req.body);
    db.prepare("UPDATE inspections SET review_status = ?, final_status = ?, reviewer_notes = ? WHERE id = ?").run(review.reviewStatus, review.finalStatus ?? before.final_status, review.reviewerNotes || null, req.params.id);
    audit("Inspection Reviewed", inspectionId, req.user!.id, { reviewStatus: before.review_status, finalStatus: before.final_status }, review);
    res.json({ message: "Reviewer assessment saved. Automated evidence remains unchanged." });
  } catch (error) { next(error); }
});

app.get("/api/products", (req, res, next) => {
  try {
    const search = String(req.query.search ?? "").trim(); const like = `%${search}%`;
    const items = db.prepare(`SELECT p.*, MAX(i.created_at) AS last_inspection, COUNT(i.id) AS inspection_count, SUM(CASE WHEN i.status = 'NON_COMPLIANT' THEN 1 ELSE 0 END) AS non_compliant_count, (SELECT i2.status FROM inspections i2 WHERE i2.product_id = p.id ORDER BY i2.created_at DESC LIMIT 1) AS compliance_status FROM products p LEFT JOIN inspections i ON i.product_id = p.id WHERE p.name LIKE ? OR COALESCE(p.manufacturer, '') LIKE ? GROUP BY p.id ORDER BY last_inspection DESC`).all(like, like);
    res.json({ items });
  } catch (error) { next(error); }
});

app.get("/api/products/:id", (req, res, next) => {
  try {
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    if (!product) return apiError(res, 404, "PRODUCT_NOT_FOUND", "Product not found.");
    const inspections = db.prepare("SELECT id, created_at, status, score, compliance_pct, inspector_name FROM inspections WHERE product_id = ? ORDER BY created_at DESC").all(req.params.id);
    res.json({ product, inspections });
  } catch (error) { next(error); }
});

app.get("/api/violations", (req, res, next) => {
  try {
    const status = String(req.query.status ?? ""); const severity = String(req.query.severity ?? ""); const rule = String(req.query.rule ?? "");
    const conditions: string[] = []; const values: unknown[] = [];
    if (["Open", "Under Review", "Resolved"].includes(status)) { conditions.push("v.status = ?"); values.push(status); }
    if (["High", "Medium", "Low"].includes(severity)) { conditions.push("v.severity = ?"); values.push(severity); }
    if (rule) { conditions.push("v.rule_code = ?"); values.push(rule); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const items = db.prepare(`SELECT v.*, i.product_name, i.manufacturer, i.status AS inspection_status FROM violations v JOIN inspections i ON i.id = v.inspection_id ${where} ORDER BY v.created_at DESC`).all(...values);
    res.json({ items });
  } catch (error) { next(error); }
});

app.patch("/api/violations/:id", requireRole("Administrator", "Reviewer", "Enforcement Officer"), (req, res, next) => {
  try {
    const update = z.object({ status: z.enum(["Open", "Under Review", "Resolved"]) }).parse(req.body);
    const violation = db.prepare("SELECT * FROM violations WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
    if (!violation) return apiError(res, 404, "VIOLATION_NOT_FOUND", "Violation not found.");
    db.prepare("UPDATE violations SET status = ? WHERE id = ?").run(update.status, req.params.id);
    audit("Violation Updated", String(violation.inspection_id), req.user!.id, { status: violation.status }, update);
    res.json({ message: "Violation status updated." });
  } catch (error) { next(error); }
});

app.get("/api/rules", (_req, res) => res.json({ ruleVersion: "Rule_6_Legal_Metrology_2011", items: RULES.map((rule) => ({ ...rule, unsupportedChecks: ["Font-size validation", "Placement validation", "Readability measurement"] })) }));

app.get("/api/dashboard/summary", (_req, res, next) => {
  try {
    const counts = db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'COMPLIANT' THEN 1 ELSE 0 END) AS compliant, SUM(CASE WHEN status = 'PARTIAL' THEN 1 ELSE 0 END) AS partial, SUM(CASE WHEN status = 'NON_COMPLIANT' THEN 1 ELSE 0 END) AS nonCompliant FROM inspections").get() as Record<string, number>;
    const reports = (db.prepare("SELECT COUNT(*) AS total FROM reports").get() as { total: number }).total;
    const violationCategories = db.prepare("SELECT requirement AS label, COUNT(*) AS value FROM violations GROUP BY requirement ORDER BY value DESC LIMIT 6").all();
    const recent = db.prepare("SELECT i.id, i.product_name, i.created_at, i.status, i.score, i.inspector_name, COUNT(v.id) AS violations FROM inspections i LEFT JOIN violations v ON v.inspection_id = i.id GROUP BY i.id ORDER BY i.created_at DESC LIMIT 8").all();
    const total = counts.total ?? 0;
    res.json({ kpis: { totalInspections: total, compliant: counts.compliant ?? 0, partial: counts.partial ?? 0, nonCompliant: counts.nonCompliant ?? 0, violationRate: total ? Number((((counts.partial ?? 0) + (counts.nonCompliant ?? 0)) / total * 100).toFixed(1)) : 0, reportsGenerated: reports }, distribution: [{ name: "Compliant", value: counts.compliant ?? 0 }, { name: "Partial", value: counts.partial ?? 0 }, { name: "Non-compliant", value: counts.nonCompliant ?? 0 }], violationCategories, recent });
  } catch (error) { next(error); }
});

app.get("/api/dashboard/trends", (_req, res, next) => {
  try {
    const items = db.prepare("SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS inspections, SUM(CASE WHEN status = 'NON_COMPLIANT' THEN 1 ELSE 0 END) AS nonCompliant FROM inspections GROUP BY substr(created_at, 1, 10) ORDER BY date DESC LIMIT 30").all().reverse();
    res.json({ items });
  } catch (error) { next(error); }
});

app.get("/api/search", (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim(); if (q.length < 2) return res.json({ inspections: [], products: [], violations: [] });
    const like = `%${q}%`;
    const inspections = db.prepare("SELECT id, product_name, status, created_at FROM inspections WHERE id LIKE ? OR product_name LIKE ? OR manufacturer LIKE ? LIMIT 8").all(like, like, like);
    const products = db.prepare("SELECT id, name, manufacturer FROM products WHERE name LIKE ? OR manufacturer LIKE ? LIMIT 6").all(like, like);
    const violations = db.prepare("SELECT v.id, v.inspection_id, v.requirement, i.product_name FROM violations v JOIN inspections i ON i.id = v.inspection_id WHERE v.requirement LIKE ? OR v.reason LIKE ? LIMIT 6").all(like, like);
    res.json({ inspections, products, violations });
  } catch (error) { next(error); }
});

app.get("/api/reports", (_req, res, next) => {
  try { res.json({ items: db.prepare("SELECT r.*, i.product_name, i.status FROM reports r JOIN inspections i ON i.id = r.inspection_id ORDER BY r.created_at DESC").all() }); } catch (error) { next(error); }
});

app.post("/api/reports/:inspectionId/generate", requireRole("Administrator", "Reviewer", "Enforcement Officer"), async (req, res, next) => {
  try {
    const inspectionId = routeParam(req, "inspectionId");
    inspectionOr404(inspectionId);
    const requested = z.object({ formats: z.array(z.enum(["pdf", "docx"])).min(1).max(2).optional() }).parse(req.body ?? {});
    const formats = requested.formats ?? ["pdf", "docx"];
    const files = await Promise.all(formats.map((format) => generateReport(inspectionId, format, req.user!.id)));
    audit("Report Generated", inspectionId, req.user!.id, undefined, { formats });
    res.status(201).json({ message: "Report generated successfully.", files });
  } catch (error) { next(error); }
});

app.get("/api/reports/:inspectionId/:format", (req, res, next) => {
  try {
    const format = routeParam(req, "format").toLowerCase();
    if (!["pdf", "docx"].includes(format)) return apiError(res, 400, "INVALID_REPORT_FORMAT", "Report format must be PDF or DOCX.");
    const report = db.prepare("SELECT storage_key FROM reports WHERE inspection_id = ? AND lower(format) = ? ORDER BY created_at DESC LIMIT 1").get(routeParam(req, "inspectionId"), format) as { storage_key: string } | undefined;
    if (!report) return apiError(res, 404, "REPORT_NOT_FOUND", "No generated report is available in that format.");
    res.sendFile(path.join(reportPath, report.storage_key));
  } catch (error) { next(error); }
});

app.use("/uploads", express.static(uploadPath, { fallthrough: false, maxAge: "1d" }));
app.use("/reports", express.static(reportPath, { fallthrough: false, maxAge: "1h" }));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const err = error as { status?: number; code?: string; message?: string; name?: string };
  if (err.name === "ZodError") return apiError(res, 400, "VALIDATION_ERROR", "Some submitted values are invalid. Please review the form and try again.");
  if (err.name === "MulterError") return apiError(res, err.code === "LIMIT_FILE_SIZE" ? 413 : 400, "UPLOAD_ERROR", err.code === "LIMIT_FILE_SIZE" ? `Image exceeds the ${config.maxUploadBytes / 1024 / 1024} MB limit.` : "The image upload could not be processed.");
  if (err.status) return apiError(res, err.status, "REQUEST_ERROR", err.message ?? "The request could not be completed.");
  console.error(error);
  return apiError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. The incident has been logged.");
});

app.listen(config.port, () => console.log(`MetrologyGuard API listening on ${config.port}`));

export { app };
