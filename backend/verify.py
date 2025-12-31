# Data verification and restoration using Pydantic, ScaleNx, Inpaint
from typing import Any

import io
import json
import logging

import numpy as np
from PIL import Image
from pydantic import ValidationError
from reedsolo import RSCodec, ReedSolomonError

from preparation import DataPackage

def scalenx_inpaint(image_bytes: bytes) -> bytes:
	"""
	Applies conditional luma normalization and inpainting to restore damaged image data.
	Uses OpenCV for inpainting (Telea algorithm) while preserving pixel density.
	"""
	import cv2
	# Load image
	img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
	arr = np.array(img)
	alpha_channel = arr[..., 3]
	rgb = arr[..., :3]
	luma = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
	brightness = float(np.mean(luma))
	contrast = float(np.std(luma))
	if brightness < 60.0:
		ycrcb = cv2.cvtColor(rgb, cv2.COLOR_RGB2YCrCb)
		y_channel = ycrcb[..., 0]
		y_channel = cv2.equalizeHist(y_channel)
		ycrcb[..., 0] = y_channel
		rgb = cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2RGB)
		luma = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
	# Create mask: alpha=0 or luma anomalies (noise spikes)
	median_luma = cv2.medianBlur(luma, 3)
	luma_delta = cv2.absdiff(luma, median_luma)
	anomaly_threshold = max(12, int(contrast * 2.0))
	anomaly_mask = luma_delta > anomaly_threshold
	mask = ((alpha_channel == 0) | anomaly_mask).astype(np.uint8) * 255
	# Inpaint (Telea) without resizing
	inpainted = cv2.inpaint(rgb, mask, 3, cv2.INPAINT_TELEA)
	# Convert back to bytes
	out_img = Image.fromarray(inpainted)
	buf = io.BytesIO()
	out_img.save(buf, format="PNG")
	return buf.getvalue()

def _rs_heal_payload(payload_bytes: bytes, parity_ratio: float = 0.5) -> bytes:
	if not payload_bytes:
		return payload_bytes
	if parity_ratio <= 0:
		return payload_bytes
	block_size = int(len(payload_bytes) / (1 + parity_ratio))
	parity_bytes = len(payload_bytes) - block_size
	if parity_bytes <= 0:
		return payload_bytes
	try:
		decoded, _, _ = RSCodec(parity_bytes).decode(payload_bytes)
		return bytes(decoded)
	except ReedSolomonError as exc:
		raise ValueError(f"RS decode failed: {exc}") from exc

def _extract_parity_ratio(restored_dict: dict | None) -> float:
	if not isinstance(restored_dict, dict):
		return 0.5
	metadata = restored_dict.get("metadata") or {}
	try:
		return float(metadata.get("rs_parity_ratio", 0.5))
	except (TypeError, ValueError):
		return 0.5

def verify_and_restore(restored_payload: bytes) -> dict:

	"""
	Verifies and restores the data using Pydantic, ScaleNx, and Inpaint.
	Returns a dict with the final verified data, restoration info, and error details if any.
	"""
	restored_dict = None
	parity_ratio = 0.5
	try:
		# Attempt to validate the restored payload as a DataPackage
		if isinstance(restored_payload, bytes):
			try:
				restored_dict = json.loads(restored_payload.decode("utf-8"))
				parity_ratio = _extract_parity_ratio(restored_dict)
			except (UnicodeDecodeError, json.JSONDecodeError) as exc:
				logging.warning(f"JSON decode failed, attempting RS healing: {exc}")
				healed_payload = _rs_heal_payload(restored_payload, parity_ratio=parity_ratio)
				restored_dict = json.loads(healed_payload.decode("utf-8"))
				parity_ratio = _extract_parity_ratio(restored_dict)
		else:
			restored_dict = restored_payload
			parity_ratio = _extract_parity_ratio(restored_dict)
		package = DataPackage(**restored_dict)
		return {"verified_data": package.dict(), "restoration": "none_needed"}
	except (ValidationError, Exception) as e:
		logging.warning(f"Initial validation failed: {e}")
		# If validation fails, attempt restoration with ScaleNx and Inpaint
		try:
			restored_bytes = restored_payload if isinstance(restored_payload, bytes) else json.dumps(restored_payload).encode("utf-8")
			repaired_bytes = scalenx_inpaint(restored_bytes)
			# Try validation again after restoration
			try:
				repaired_dict = json.loads(repaired_bytes.decode("utf-8"))
			except (UnicodeDecodeError, json.JSONDecodeError) as exc:
				logging.warning(f"JSON decode failed after inpaint, attempting RS healing: {exc}")
				healed_payload = _rs_heal_payload(repaired_bytes, parity_ratio=parity_ratio)
				repaired_dict = json.loads(healed_payload.decode("utf-8"))
			package = DataPackage(**repaired_dict)
			return {"verified_data": package.dict(), "restoration": "scalenx_inpaint_applied"}
		except Exception as e2:
			logging.error(f"Restoration failed: {e2}")
			return {
				"verified_data": None,
				"restoration": f"restoration_failed: {e}; inpaint_error: {e2}",
				"error": str(e2)
			}
