"""Internal inference gateway for the supplied LegalMetrologyModel bundle.

The browser never calls this service.  It retains the supplied predictor and
returns its result without independently recalculating compliance.
"""
import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from model_bundle.predictor import LegalMetrologyModel

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("metrologyguard.ml")
BUNDLE_DIR = Path(__file__).parent / "model_bundle"
CONFIG = json.loads((BUNDLE_DIR / "pipeline_config.json").read_text(encoding="utf-8"))
model: LegalMetrologyModel | None = None
model_error: str | None = None


def load_model() -> None:
    global model, model_error
    try:
        requested_gpu = os.getenv("ML_USE_GPU", "").lower() in {"1", "true", "yes"}
        model = LegalMetrologyModel(use_gpu=requested_gpu if requested_gpu else None)
        model_error = None
        logger.info("Loaded model %s on %s", CONFIG.get("version"), model.device)
    except Exception as exc:  # logged internally; never sent as a traceback
        model = None
        model_error = str(exc)
        logger.exception("Model initialization failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await asyncio.to_thread(load_model)
    yield


app = FastAPI(title="MetrologyGuard ML Service", version=CONFIG.get("version", "unknown"), lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ready": model is not None,
        "model": {"name": CONFIG.get("name"), "version": CONFIG.get("version"), "engine": CONFIG.get("engine")},
        "device": model.device if model else None,
        "error": "Model is unavailable" if model_error else None,
    }


@app.post("/predict")
async def predict(image: UploadFile = File(...)) -> JSONResponse:
    if model is None:
        raise HTTPException(status_code=503, detail="The analysis engine is temporarily unavailable.")
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WebP images are supported.")

    content = await image.read()
    if not content or len(content) > 12 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="The uploaded image is empty or exceeds the 12 MB limit.")
    decoded = cv2.imdecode(np.frombuffer(content, np.uint8), cv2.IMREAD_COLOR)
    if decoded is None:
        raise HTTPException(status_code=422, detail="The uploaded file could not be read as an image.")

    try:
        result = await asyncio.to_thread(model.predict, decoded)
    except Exception:
        logger.exception("Inference failed")
        raise HTTPException(status_code=502, detail="Image analysis could not be completed. Please retry or use a clearer image.")

    # Preserve the model result while filling service-level metadata consistently.
    result["device"] = result.get("device", model.device)
    result["boxes_count"] = result.get("boxes_count", len(result.get("raw_boxes", [])))
    result["model"] = {
        "name": CONFIG.get("name"),
        "version": CONFIG.get("version"),
        "engine": CONFIG.get("engine"),
        "rule_version": CONFIG.get("rules"),
    }
    return JSONResponse(result)
