# Testing

## Automated tests

- `npm test --workspace=@metrologyguard/api` verifies model-backed rule definitions and the manual-review boundary.
- `npm test --workspace=@metrologyguard/web` verifies presentation helpers that render persisted statuses.
- From `services/ml-service`, `python tests/test_predictor_contract.py` exercises the supplied predictor's parsing and rule contract with deterministic OCR responses: full declaration set, missing declarations, and empty OCR.

## Required release checks

1. Run a valid image through the real ML service and confirm retained OCR boxes and model metadata.
2. Verify invalid MIME, invalid magic bytes, over-size uploads, empty OCR, unavailable ML service, and report-generation failures show safe user messages.
3. Verify a manual review never changes `automated_status`, OCR boxes, or rule results.
4. Verify PDF and DOCX include inspection ID, model/rule versions, automated result, review record, declarations, rules, and violations.
5. Test narrow and mobile layouts, keyboard navigation, visible focus, and command search.
