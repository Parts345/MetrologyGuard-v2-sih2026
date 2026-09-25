# MetrologyGuard

MetrologyGuard is an enterprise-oriented Legal Metrology Packaged Commodities Compliance Platform. It separates the user-facing React application from the Node.js orchestration API and the supplied RapidOCR/ONNX inference bundle.

## What is implemented

- React + TypeScript operational application with login, dashboard, inspection workflow, evidence viewer, inspection/product/violation/report repositories, rules reference, global search, and responsive navigation.
- Node.js API with SQLite persistence, image signature and size validation, RBAC boundary, CORS, Helmet, rate limiting, audit records, pagination, report generation, and human-readable errors.
- Internal FastAPI service wrapping the supplied `LegalMetrologyModel` without replacing its inference or declaration logic.
- PDF and editable DOCX compliance reports with automated evidence, manual review, model/rule versions, and traceability data.

## Quick start 

1. Install Node.js 22 or later, then copy `.env.example` to `.env` and review the storage and service URLs.
2. Install Node dependencies: `npm ci`.
3. Create a Python virtual environment in `services/ml-service`, then install `pip install -r requirements.txt`.
4. Run the ML service: `uvicorn main:app --host 0.0.0.0 --port 8000` from `services/ml-service`.
5. Run the API: `npm run dev --workspace=@metrologyguard/api`.
6. Run the web application: `npm run dev --workspace=@metrologyguard/web`.

Open `http://localhost:5173`. The local login is an authentication-ready UI boundary; connect it to your OIDC/JWT provider before production use.

## Important evidence boundary

The supplied model detects the presence of six declarations using OCR and rules. It does **not** validate statutory font size, physical placement, or a full readability measurement. The platform labels those checks **Not evaluated** and preserves a separate manual-review record.

Further detail is in [docs](docs/architecture.md), including the [test guide](docs/testing.md).










run cmd

ML:
cd ~/Documents/Legal_metrology_sih/services/ml-service
source venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

API:
cd ~/Documents/Legal_metrology_sih
npm run dev --workspace=@metrologyguard/api

WEB:
cd ~/Documents/Legal_metrology_sih
npm run dev --workspace=@metrologyguard/web
