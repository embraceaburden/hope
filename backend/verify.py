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
	Applies ScaleNx (scaling) and inpainting to restore damaged image data.
	Uses OpenCV for inpainting (Telea algorithm) and numpy for scaling.
	"""
	import cv2
	# Load image
	img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
	arr = np.array(img)
	# Create mask: assume missing data is where alpha=0
	mask = (arr[..., 3] == 0).astype(np.uint8) * 255
	# Inpaint (Telea)
	inpainted = cv2.inpaint(arr[..., :3], mask, 3, cv2.INPAINT_TELEA)
	# Scale up using ScaleNx (e.g., cv2.INTER_CUBIC for demo)
	scale_factor = 2
	scaled = cv2.resize(inpainted, (arr.shape[1]*scale_factor, arr.shape[0]*scale_factor), interpolation=cv2.INTER_CUBIC)
	# Convert back to bytes
	out_img = Image.fromarray(scaled)
	buf = io.BytesIO()
	out_img.save(buf, format="PNG")
	return buf.getvalue()

def _rs_heal_payload(payload_bytes: bytes, parity_ratio: float = 0.5) -> bytes:
	if not payload_bytes:
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

def verify_and_restore(restored_payload: bytes) -> dict:

	"""
	Verifies and restores the data using Pydantic, ScaleNx, and Inpaint.
	Returns a dict with the final verified data, restoration info, and error details if any.
	"""
	try:
		# Attempt to validate the restored payload as a DataPackage
		if isinstance(restored_payload, bytes):
			try:
				restored_dict = json.loads(restored_payload.decode("utf-8"))
			except (UnicodeDecodeError, json.JSONDecodeError) as exc:
				logging.warning(f"JSON decode failed, attempting RS healing: {exc}")
				healed_payload = _rs_heal_payload(restored_payload)
				restored_dict = json.loads(healed_payload.decode("utf-8"))
		else:
			restored_dict = restored_payload
		package = DataPackage(**restored_dict)
		return {"verified_data": package.dict(), "restoration": "none_needed"}
	except (ValidationError, Exception) as e:
		logging.warning(f"Initial validation failed: {e}")
		# If validation fails, attempt restoration with ScaleNx and Inpaint
		try:
			restored_bytes = restored_payload if isinstance(restored_payload, bytes) else json.dumps(restored_payload).encode("utf-8")
			repaired_bytes = scalenx_inpaint(restored_bytes)
			# Try validation again after restoration
			repaired_dict = json.loads(repaired_bytes.decode("utf-8"))
			package = DataPackage(**repaired_dict)
			return {"verified_data": package.dict(), "restoration": "scalenx_inpaint_applied"}
		except Exception as e2:
			logging.error(f"Restoration failed: {e2}")
			return {
				"verified_data": None,
				"restoration": f"restoration_failed: {e}; inpaint_error: {e2}",
				"error": str(e2)
			}
