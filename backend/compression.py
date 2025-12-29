# Hyper-compression (Zstandard, Neuroglyph)
from typing import Any



import zstandard as zstd
import logging


def hyper_compress(patternized_blob: bytes, zstd_dict: bytes = None, level: int = 22) -> dict:
	emit_job_update(job_id, job_data)
	"""
	Applies Zstandard hyper-compression to the patternized binary blob.
	Uses advanced frame helpers for diagnostics and supports optional dictionaries.
	Returns a dict with the compressed blob, compression stats, and frame diagnostics.
	"""
	try:
		# Optional: Use a Zstandard dictionary if provided
		if zstd_dict:
			zdict = zstd.ZstdCompressionDict(zstd_dict)
			compressor = zstd.ZstdCompressor(level=level, dict_data=zdict)
		else:
			compressor = zstd.ZstdCompressor(level=level)
		compressed_blob = compressor.compress(patternized_blob)
		ratio = len(patternized_blob) / len(compressed_blob) if len(compressed_blob) > 0 else 1.0

		# Frame diagnostics
		frame_params = None
		frame_size = None
		try:
			frame_params = zstd.get_frame_parameters(compressed_blob)
			frame_size = zstd.frame_content_size(compressed_blob)
		except Exception:
			pass

		return {
			"compressed_blob": compressed_blob,
			"compression_ratio": ratio,
			"frame_parameters": frame_params,
			"frame_content_size": frame_size,
			"zstd_level": level,
			"zstd_dict_used": bool(zstd_dict),
		}
	except Exception as e:
		logging.exception("Zstandard compression failed")
		raise RuntimeError(f"Zstandard compression failed: {e}")
