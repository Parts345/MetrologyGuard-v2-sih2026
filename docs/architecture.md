# Architecture

```text
React / TypeScript web application
          │ public HTTP
          ▼
Node.js API ─── SQLite database + local secure storage
          │ internal HTTP only
          ▼
Python FastAPI ML service
          │
          ▼
Supplied LegalMetrologyModel → RapidOCR + ONNX Runtime
```

The browser speaks only to the Node API. The API validates and stores uploads, sends the stored image to the internal `POST /predict` endpoint, and persists the model response as immutable automated evidence. It then returns inspection data to the React application.

The server stores `automated_status`, `review_status`, and `final_status` independently. A reviewer can add an assessment and notes but cannot overwrite OCR evidence or the automated decision.

The initial runtime uses SQLite for simple local and single-node deployments. The relational schema is deliberately normalised so an operational PostgreSQL adapter can be introduced without changing API contracts; do not run multi-node production workloads against a shared SQLite file.

## Data flow

1. Officer creates an inspection and uploads one or more package images.
2. API validates MIME type, magic bytes, and configured file-size limit, then stores the image outside the public web bundle.
3. API asks the ML service to predict from that image.
4. ML service invokes the supplied `LegalMetrologyModel.predict()` and returns its result plus version metadata.
5. API stores OCR regions, declarations, rule outcomes, violations, timings, model/rule versions, and audit events in one transaction.
6. React renders the retained evidence; it never calculates compliance.
7. Reports copy the stored record into PDF and DOCX formats.
