# Unshuffle and reverse geometric scrambling using PassageMath
from typing import Any

from passagemath_polyhedra import polytopes
import numpy as np
from PIL import Image
import io


def reverse_geometric_scramble(
	image_b: bytes,
	permutation_key: str,
	polytope_type: str = "cube",
	backend: str = "latte",
	block_size: int = None
) -> dict:
	"""
	Reverses the geometric scramble using PassageMath and the permutation key.
	Returns a dict with the sequential binary data (as bytes) and metadata.
	"""
	import logging
	try:
		# Load image as array
		img = Image.open(io.BytesIO(image_b))
		arr = np.array(img)
		shape = arr.shape
		# Polytope/seed logic for reproducibility
		if polytope_type == "cube":
			poly = polytopes.cube(backend=backend)
		elif polytope_type == "grand_antiprism":
			poly = polytopes.grand_antiprism(backend=backend)
		elif polytope_type == "regular_polygon":
			poly = polytopes.regular_polygon(5, exact=False, backend=backend)
		else:
			poly = polytopes.cube(backend=backend)
		seed = int(permutation_key)
		np.random.seed(seed)
		# Block-wise unscrambling (if block_size provided)
		unscrambled = arr.copy()
		if block_size is None:
			block_size = max(1, int(np.cbrt(arr.size // seed)))
		for i in range(0, shape[0], block_size):
			for j in range(0, shape[1], block_size):
				block = unscrambled[i:i+block_size, j:j+block_size]
				flat = block.flatten()
				perm = np.random.permutation(len(flat))
				inv_perm = np.argsort(perm)
				block_unscrambled = flat[inv_perm].reshape(block.shape)
				unscrambled[i:i+block_size, j:j+block_size] = block_unscrambled
		# Convert back to bytes (PNG)
		out_img = Image.fromarray(unscrambled.astype(arr.dtype))
		buf = io.BytesIO()
		out_img.save(buf, format="PNG")
		return {
			"sequential_data": buf.getvalue(),
			"metadata": {
				"polytope_type": polytope_type,
				"backend": backend,
				"block_size": block_size
			}
		}
	except Exception as e:
		logging.exception("Reverse geometric scramble failed")
		raise RuntimeError(f"Reverse geometric scramble failed: {e}")
