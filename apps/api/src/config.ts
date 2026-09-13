import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, "..");
const projectRoot = path.resolve(apiRoot, "..", "..");

export const config = {
  environment: process.env.NODE_ENV ?? "development",
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  mlServiceUrl: process.env.ML_SERVICE_URL ?? "http://localhost:8000",
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 12) * 1024 * 1024,
  databasePath: path.resolve(apiRoot, process.env.DATABASE_PATH ?? "../../database/metrologyguard.db"),
  storagePath: path.resolve(apiRoot, process.env.STORAGE_PATH ?? "../../storage"),
  trustIdentityProxy: process.env.TRUST_IDENTITY_PROXY === "true",
  projectRoot,
};

export const uploadPath = path.join(config.storagePath, "uploads");
export const reportPath = path.join(config.storagePath, "reports");
