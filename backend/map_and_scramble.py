# Geometric mapping and scrambling (PassageMath)
from typing import Any



# Advanced PassageMath polyhedral helpers
from passagemath_polyhedra import polytopes

import numpy as np
from PIL import Image
import io


def geometric_map_and_scramble(compressed_blob: bytes, polytope_type: str = "cube", backend: str = "latte") -> dict:
	emit_job_update(job_id, job_data)
	"""
	Maps and scrambles the compressed blob using PassageMath polyhedral helpers and geometric/topological scrambling.
	Returns a dict with the scrambled blob, permutation key, and mapping parameters.
	"""
	try:
		# Select polytope and backend
		if polytope_type == "cube":
			poly = polytopes.cube(backend=backend)
		elif polytope_type == "grand_antiprism":
			poly = polytopes.grand_antiprism(backend=backend)
		elif polytope_type == "regular_polygon":
			poly = polytopes.regular_polygon(5, exact=False, backend=backend)
		else:
			poly = polytopes.cube(backend=backend)

		# Use polyhedral integral points as permutation key (deterministic, backend-specific)
		permutation_key = poly.integral_points_count()
		f_vector = None
		try:
			f_vector = poly.f_vector()
		except Exception:
			pass

		# Load compressed_blob as image (PNG)
		img = Image.open(io.BytesIO(compressed_blob))
		arr = np.array(img)
		shape = arr.shape

		# Geometric/topological scrambling: scramble by polyhedral cell/region
		# For simplicity, scramble by blocks (cells) based on polytope dimension
		dim = len(shape)
		block_size = max(1, int(np.cbrt(arr.size // permutation_key)))
		scrambled = arr.copy()
		np.random.seed(int(permutation_key))
		# Scramble blocks (not just flat permutation)
		for i in range(0, shape[0], block_size):
			for j in range(0, shape[1], block_size):
				block = scrambled[i:i+block_size, j:j+block_size]
				flat = block.flatten()
				perm = np.random.permutation(len(flat))
				block_scrambled = flat[perm].reshape(block.shape)
				scrambled[i:i+block_size, j:j+block_size] = block_scrambled

		# Convert back to bytes (PNG)
		out_img = Image.fromarray(scrambled.astype(arr.dtype))
		buf = io.BytesIO()
		out_img.save(buf, format="PNG")
		return {
			"scrambled_blob": buf.getvalue(),
			"permutation_key": str(permutation_key),
			"polytope_type": polytope_type,
			"backend": backend,
			"f_vector": f_vector,
			"block_size": block_size,
		}
	except Exception as e:
		import logging
		logging.exception("PassageMath mapping/scrambling failed")
		raise RuntimeError(f"PassageMath mapping/scrambling failed: {e}")
