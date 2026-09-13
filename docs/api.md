# API reference

All application APIs are rooted at `/api`. Standard error responses are `{ "error": { "code", "message" } }`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/inspections` | Create a pending inspection |
| POST | `/inspections/:id/images` | Validate and store a package image |
| POST | `/inspections/:id/analyze` | Invoke internal model service and persist result |
| GET | `/inspections` | Paginated inspection repository; supports `search`, `status`, `page` |
| GET | `/inspections/:id` | Inspection, image, OCR evidence, results, reports, audit trail |
| PATCH | `/inspections/:id/review` | Record separate manual review |
| GET | `/products`, `/products/:id` | Product repository and history |
| GET/PATCH | `/violations`, `/violations/:id` | Violation repository and workflow status |
| GET | `/rules` | Rule metadata and evaluation boundary |
| GET | `/dashboard/summary`, `/dashboard/trends` | Operational metrics |
| GET | `/search?q=` | Cross-repository search |
| POST | `/reports/:inspectionId/generate` | Create PDF and/or DOCX report |
| GET | `/reports/:inspectionId/pdf`, `/reports/:inspectionId/docx` | Latest report by format |

Protected write operations use a role boundary. The development adapter reads `x-user-*` headers; replace this adapter with verified OIDC/JWT claims before production deployment.
