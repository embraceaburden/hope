# Decompress binary blob using Zstandard
import zstandard as zstd
# Decompress binary blob using Zstandard
from typing import Any


def decompress_blob(binary_blob: bytes) -> dict:
	emit_job_update(job_id, job_data)
	"""
	Decompresses the binary blob using Zstandard.
	Returns a dict with the decompressed data and diagnostics.
	"""
	import logging
	try:
		decompressor = zstd.ZstdDecompressor()
		decompressed_data = decompressor.decompress(binary_blob)
		# Diagnostics
		frame_size = None
		try:
			frame_size = zstd.frame_content_size(binary_blob)
		except Exception:
			pass
		return {
			"decompressed_data": decompressed_data,
			"frame_content_size": frame_size
		}
	except Exception as e:
		logging.exception("Zstandard decompression failed")
		raise RuntimeError(f"Zstandard decompression failed: {e}")
