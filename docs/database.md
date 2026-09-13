# Database design

The SQLite schema is created by `apps/api/src/db.ts` and uses foreign keys plus WAL mode. Primary entities are:

```text
products ──< inspections ──< inspection_images
                       ├──< ocr_results (one retained result per analysis)
                       ├──< declarations
                       ├──< rule_results
                       ├──< violations
                       ├──< reports
                       └──< audit_logs
users ────────────────────────────────< inspections / audit_logs
```

`inspections` owns the authoritative automated status and its separate reviewer/final fields. `raw_boxes_json` preserves coordinates, text and confidence returned by the model. No frontend-only status or score is persisted.

The schema is portable SQL in style; planned PostgreSQL operations should use a pooled repository adapter, migrations, object storage for images/reports, and a managed retention policy.
