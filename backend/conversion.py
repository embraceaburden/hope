from typing import Any
from preparation import DataPackage
import logging


try:
	from neuroglyph_quantum import QuantumPNGCodec
	from neuroglyph_neural import NeuralPNGCodec
except ImportError:
	QuantumPNGCodec = None
	NeuralPNGCodec = None

def _select_codec(data_bytes: bytes, meta: dict) -> Any:
	
	if QuantumPNGCodec:
		return QuantumPNGCodec(), "QuantumPNG"
	elif NeuralPNGCodec:
		return NeuralPNGCodec(), "NeuralPNG"
	else:
		raise ImportError("No Neuroglyph codecs available. Please install neuroglyph_quantum or neuroglyph_neural.")

def serialize_and_patternize(package: DataPackage) -> dict:

	if not (QuantumPNGCodec or NeuralPNGCodec):
		raise ImportError("Neuroglyph advanced codecs are not installed. Please install neuroglyph_quantum or neuroglyph_neural.")
	try:
		original_data = package.dict() if hasattr(package, 'dict') else package
		codec, codec_name = _select_codec(original_data, package.metadata)
		try:
			if codec_name == "QuantumPNG" and hasattr(codec, 'compress_adaptive'):
				compressed, metrics = codec.compress_adaptive(original_data)
			elif hasattr(codec, 'compress'):
				compressed, metrics = codec.compress(original_data)
			else:
				raise RuntimeError("No suitable compress method found in Neuroglyph codec.")
		except TypeError:
			compressed, metrics = codec.compress(package.raw_bytes)
		if not metrics or not isinstance(metrics, dict):
			metrics = {}
		if 'original_size' not in metrics:
			if isinstance(original_data, (bytes, bytearray)):
				metrics['original_size'] = len(original_data)
			elif hasattr(original_data, 'nbytes'):
				metrics['original_size'] = original_data.nbytes
			elif hasattr(package, 'raw_bytes'):
				metrics['original_size'] = len(package.raw_bytes)
			else:
				metrics['original_size'] = None
		if 'compressed_size' not in metrics:
			metrics['compressed_size'] = len(compressed) if isinstance(compressed, (bytes, bytearray)) else None
		if 'compression' not in metrics:
			try:
				metrics['compression'] = metrics['original_size'] / max(1, metrics['compressed_size'])
			except Exception:
				metrics['compression'] = 1.0
				emit_job_update(job_id, job_data)
		return {
			"patternized_blob": compressed,
			"name": package.name,
			"type": package.type,
			"metadata": package.metadata,
			"codec": codec_name,
			"metrics": metrics,
		}
	except Exception as e:
		logging.exception("Neuroglyph serialization/patternizing failed")
		raise RuntimeError(f"Neuroglyph serialization/patternizing failed: {e}")
