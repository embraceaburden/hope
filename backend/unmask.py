
# Unmask and separate alpha layers using Pillow
from typing import Any
from PIL import Image
import io
import logging

def unmask_alpha_layers(decrypted_image: bytes) -> dict:
	"""
	Separates the alpha (A) and embedded (B) layers from the decrypted image using Pillow.
	Returns a dict with separated layers as bytes and metadata.
	"""
	try:
		image = Image.open(io.BytesIO(decrypted_image)).convert("RGBA")
		# Extract alpha channel (A) and RGB (B)
		r, g, b, a = image.split()
		# Image A: alpha layer as grayscale PNG
		image_a = Image.merge("L", (a,))
		buf_a = io.BytesIO()
		image_a.save(buf_a, format="PNG")
		# Image B: RGB only (no alpha)
		image_b = Image.merge("RGB", (r, g, b))
		buf_b = io.BytesIO()
		image_b.save(buf_b, format="PNG")
		return {
			"image_a": buf_a.getvalue(),
			"image_b": buf_b.getvalue(),
			"metadata": {
				"mode": image.mode,
				"size": image.size
			}
		}
	except Exception as e:
		logging.exception("Unmasking alpha layers failed")
		raise RuntimeError(f"Unmasking alpha layers failed: {e}")
