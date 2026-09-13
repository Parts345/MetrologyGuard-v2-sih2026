# Security

- Uploads accept JPEG, PNG and WebP only, enforce a default 12 MB limit, and verify magic bytes after upload.
- API security headers are supplied by Helmet; CORS permits configured web origins only; API rate limiting defaults to 300 requests per 15 minutes.
- No secret, credential, or model device setting is hard-coded in frontend code. Use `.env` / your deployment secret manager.
- The ML service is internal. Never publish port 8000 to untrusted networks in a production topology.
- RBAC supports Administrator, Enforcement Officer, Reviewer, and Read Only roles. Development uses a local identity only. Production is intentionally unavailable until an OIDC/JWT middleware or a trusted identity proxy is configured; the browser never submits trusted role headers in production.
- Audit records capture creation, image upload, analysis start/finish, review, violation updates, and report generation. Add verified identity, IP and session metadata at the identity-gateway layer.
- Put storage behind encryption, retention, backup, and access-control policies suitable for inspection evidence.
