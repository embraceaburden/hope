# Extract binary data from image using stegoImageX and Pillow
import tempfile
import os
try:
	from stegoimagex import extract_text
except ImportError:
	extract_text = None
import base64
from typing import Any


def extract_binary_data(
	embedded_image: bytes,
	password: str = "supersecret",
	layers: int = 2,
	dynamic: bool = True,
	compress: bool = True,
	adaptive: bool = True,
	logging_enabled: bool = False
) -> dict:
	"""
	Extracts the hidden message from the image using stegoImageX's extract_text.
	All extraction parameters are configurable. Returns the extracted binary blob and metadata.
	"""
	if extract_text is None:
		raise ImportError("stegoImageX library is not installed. Please install it to use this function.")
	import logging
	try:
		# Write embedded image to a temp file
		with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_img:
			temp_img.write(embedded_image)
			image_path = temp_img.name

		# Call stegoImageX's extract_text
		message = extract_text(
			image_path=image_path,
			password=password,
			layers=layers,
			dynamic=dynamic,
			compress=compress,
			adaptive=adaptive,
			logging=logging_enabled
		)

		# Clean up temp file
		os.remove(image_path)

		# Decode from base64 back to bytes
		import base64
		binary_blob = base64.b64decode(message)
		return {
			"binary_blob": binary_blob,
			"extraction_metadata": {
				"layers": layers,
				"dynamic": dynamic,
				"compress": compress,
				"adaptive": adaptive,
				"logging": logging_enabled
			}
		}
	except Exception as e:
		logging.exception("StegoImageX extraction failed")
		raise RuntimeError(f"StegoImageX extraction failed: {e}")

		return {"binary_blob": binary_blob}
	except Exception as e:
		raise RuntimeError(f"Steganographic extraction failed: {e}")

		return {"binary_blob": binary_blob}
	except Exception as e:
		raise RuntimeError(f"Steganographic extraction failed: {e}")
