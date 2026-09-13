# Deployment

## Environment

Install Node.js 22 or later. Copy `.env.example` and configure the API origin, ML service URL, upload limit, storage path, and required production identity provider configuration. Do not store production secrets in this repository.

Set `TRUST_IDENTITY_PROXY=true` only when the API is behind a server-side gateway that verifies identity and strips client-injected `x-user-*` headers. Otherwise, replace the development authentication adapter with your OIDC/JWT middleware before setting `NODE_ENV=production`.

## Local CPU deployment

Run the Python service with the supplied requirements and leave `ML_USE_GPU` unset. The supplied predictor selects standard ONNX CPU execution when CUDA is not available. Keep the ML port private in deployed environments; the Docker composition deliberately does not publish it.

Run the API and web service separately during development. The API creates `database/metrologyguard.db` and uses `storage/uploads` plus `storage/reports`.

## Docker

`docker compose up --build` builds the web, API, and ML service. The current API runtime is configured for SQLite at `/app/storage/metrologyguard.db`; the mounted storage volume preserves the database, uploads, and reports. For multi-node or managed production deployments, use the documented PostgreSQL repository-adapter migration before enabling horizontal API scaling.

For GPU deployment, use an NVIDIA-compatible base image/runtime and expose `CUDAExecutionProvider` to ONNX Runtime, then set `ML_USE_GPU=true`. Confirm `/health` reports the expected device before accepting inspection work.

## Operations

Monitor `/api/health`, back up database and evidence storage, place the ML service on a private network, configure TLS and OIDC at the gateway, and test report generation after each release.
