# Steganographic embedding and unscrambling (stegoImageX, Pillow)
from typing import Any



import tempfile
import os
from PIL import Image
import io

try:
	from stegoimagex import hide_text, extract_text, detect_message_info
except ImportError:
	hide_text = None
	extract_text = None
	detect_message_info = None


def embed_steganographic(
	scrambled_blob: bytes,
	carrier_image: bytes,
	password: str = "supersecret",
	layers: int = 2,
	dynamic: bool = True,
	compress: bool = True,
	adaptive: bool = True,
	logging_enabled: bool = False
) -> dict:
	"""
	Embeds the scrambled blob into the carrier image using stegoImageX's hide_text.
	All embedding parameters are configurable. Returns embedded image bytes and full metadata.
	"""
	if hide_text is None:
		raise ImportError("stegoImageX library is not installed. Please install it to use this function.")
	import base64
	import logging
	try:
		# Write carrier image to a temp file
		with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_in:
			temp_in.write(carrier_image)
			input_image_path = temp_in.name

		# Prepare output temp file
		with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_out:
			output_image_path = temp_out.name

		# Convert scrambled_blob to a string for stegoImageX (base64 for binary safety)
		message = base64.b64encode(scrambled_blob).decode("utf-8")

		# Call stegoImageX's hide_text with all options
		hide_text(
			input_image=input_image_path,
			output_image=output_image_path,
			message=message,
			encrypted=True,
			password=password,
			layers=layers,
			dynamic=dynamic,
			compress=compress,
			adaptive=adaptive,
			logging=logging_enabled
		)

		# Read the embedded image back as bytes
		with open(output_image_path, "rb") as f:
			embedded_image = f.read()

		# Optionally run detection for metadata
		detection = None
		if detect_message_info:
			try:
				detection = detect_message_info(output_image_path, logging=logging_enabled, layers=layers)
			except Exception:
				detection = None

		# Clean up temp files
		os.remove(input_image_path)
		os.remove(output_image_path)

		return {
			"embedded_image": embedded_image,
			"embedding_metadata": {
				"encrypted": True,
				"layers": layers,
				"dynamic": dynamic,
				"compress": compress,
				"adaptive": adaptive,
				"logging": logging_enabled,
				"detection": detection
			}
		}
	except Exception as e:
		logging.exception("Steganographic embedding failed")
		raise RuntimeError(f"Steganographic embedding failed: {e}")


# Unscrambling logic stub for reversal pipeline
def extract_steganographic(
	embedded_image: bytes,
	password: str = "supersecret",
	layers: int = 2,
	dynamic: bool = True,
	compress: bool = True,
	adaptive: bool = True
) -> dict:
	"""
	Extracts the hidden message from the embedded image using stegoImageX's extract_text.
	Returns the unscrambled (base64-decoded) bytes and extraction metadata.
	"""
	if extract_text is None:
		raise ImportError("stegoImageX library is not installed. Please install it to use this function.")
	import base64
	import logging
	try:
		# Write embedded image to a temp file
		with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_in:
			temp_in.write(embedded_image)
			input_image_path = temp_in.name

		# Extract message
		message = extract_text(
			image_path=input_image_path,
			password=password,
			layers=layers,
			dynamic=dynamic,
			compress=compress,
			adaptive=adaptive
		)
		# Decode base64 to bytes
		unscrambled_blob = base64.b64decode(message)

		# Optionally run detection for metadata
		detection = None
		if detect_message_info:
			try:
				detection = detect_message_info(input_image_path, layers=layers)
			except Exception:
				detection = None

		# Clean up temp file
		os.remove(input_image_path)

		return {
			"unscrambled_blob": unscrambled_blob,
			"extraction_metadata": {
				"layers": layers,
				"dynamic": dynamic,
				"compress": compress,
				"adaptive": adaptive,
				"detection": detection
			}
		}
	except Exception as e:
		logging.exception("Steganographic extraction failed")
		raise RuntimeError(f"Steganographic extraction failed: {e}")
