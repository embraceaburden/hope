# Data preparation and validation (Pydantic)

from pydantic import BaseModel, Field, ValidationError
from typing import Optional, Union
from pathlib import Path
from PIL import Image, UnidentifiedImageError
import io
import mimetypes
import os


class DataPackage(BaseModel):
	raw_bytes: bytes = Field(..., description="Raw input data as bytes")
	name: str = Field(..., description="Name or identifier for the data")
	type: Optional[str] = Field(None, description="Type of data (e.g., 'image', 'model', 'metadata')")
	metadata: Optional[dict] = Field(default_factory=dict, description="Additional metadata")


def _normalize_image_to_png(raw: bytes, name: str) -> bytes:
	"""
	Converts any image bytes to PNG format using Pillow. Returns PNG bytes.
	"""
	try:
		with Image.open(io.BytesIO(raw)) as img:
			with io.BytesIO() as output:
				img.save(output, format="PNG")
				return output.getvalue()
	except UnidentifiedImageError:
		raise ValueError(f"File '{name}' is not a valid image or is corrupted.")
	except Exception as e:
		raise ValueError(f"Image normalization failed for '{name}': {e}")

def _extract_metadata(file_bytes: bytes, name: str) -> dict:
	"""
	Extracts basic metadata (size, mime, etc.) for the input file.
	"""
	meta = {"size": len(file_bytes), "name": name}
	mime, _ = mimetypes.guess_type(name)
	meta["mime_type"] = mime or "application/octet-stream"
	# If image, get dimensions
	try:
		with Image.open(io.BytesIO(file_bytes)) as img:
			meta["image_width"], meta["image_height"] = img.size
			meta["image_mode"] = img.mode
	except Exception:
		pass
	return meta

def validate_and_clean(data: dict) -> DataPackage:
	"""
	Validates, normalizes, and cleans the input data for the pipeline.
	Accepts any file/image/model as bytes, normalizes images to PNG, extracts metadata.
	Raises ValueError with actionable message on failure.
	"""
	# Accepts: {"file": bytes or str or Path, "name": str, ...}
	try:
		# Accept file as bytes, str (path), Path, or NumPy array
		file_input = data.get("file") or data.get("raw_bytes")
		name = data.get("name") or "unnamed"
		# NumPy array detection and conversion
		file_bytes = None
		try:
			import numpy as np
			is_numpy = isinstance(file_input, np.ndarray)
		except ImportError:
			is_numpy = False
		if is_numpy:
			try:
				# Try to convert to PNG if 2D/3D (image-like)
				from PIL import Image
				if file_input.ndim in (2, 3):
					img = Image.fromarray(file_input)
					buf = io.BytesIO()
					img.save(buf, format='PNG')
					file_bytes = buf.getvalue()
				else:
					# Fallback: save as .npy bytes
					buf = io.BytesIO()
					np.save(buf, file_input)
					file_bytes = buf.getvalue()
			except Exception:
				# Fallback: raw bytes
				file_bytes = file_input.tobytes()
		elif isinstance(file_input, (str, Path)):
			file_path = Path(file_input)
			if not file_path.exists():
				raise ValueError(f"File path '{file_input}' does not exist.")
			with open(file_path, "rb") as f:
				file_bytes = f.read()
			name = name or file_path.name
		elif isinstance(file_input, bytes):
			file_bytes = file_input
		else:
			raise ValueError("Input must include 'file' or 'raw_bytes' as bytes, str, Path, or NumPy array.")

		# Detect if image (by magic number or extension)
		is_image = False
		try:
			with Image.open(io.BytesIO(file_bytes)) as img:
				is_image = True
		except Exception:
			# Not an image, treat as generic binary
			pass

		if is_image:
			file_bytes = _normalize_image_to_png(file_bytes, name)
			file_type = "image/png"
		else:
			file_type = data.get("type") or "binary"

		meta = _extract_metadata(file_bytes, name)
		meta.update(data.get("metadata", {}))

		package = DataPackage(
			raw_bytes=file_bytes,
			name=name,
			type=file_type,
			metadata=meta
		)
		return package
	except ValidationError as e:
		raise ValueError(f"Data validation failed: {e}")
	except Exception as e:
		raise ValueError(f"Data preparation error: {e}")
