# Model integration

The unmodified model bundle is located at `services/ml-service/model_bundle`. Its `predictor.py` remains the source of OCR, extraction, and automated compliance decisions.

`main.py` is a narrow FastAPI gateway. At startup it loads `LegalMetrologyModel`, allowing the predictor to discover the bundled detection, classification, and recognition ONNX weights. The gateway calls `model.predict(decoded_image)` in a worker thread and passes through the outcome rather than deriving a second decision.

The service reads `pipeline_config.json` and includes the following metadata in every completed prediction:

- model name and version;
- OCR engine;
- rule version;
- selected CPU/CUDA device;
- model latency and raw OCR boxes.

Set `ML_USE_GPU=true` to request GPU execution. The supplied predictor checks ONNX Runtime providers and falls back to CPU when CUDA is unavailable. The API does not expose the ML service to browsers.

The service rejects invalid, oversized, or undecodable images with a safe user message. Initialisation failures return a health state and no Python stack trace to users.
