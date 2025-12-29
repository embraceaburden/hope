# Security and cryptographic sealing (PyCryptodome, Pillow)
from typing import Any


from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from Crypto.Protocol.KDF import PBKDF2
from PIL import Image
import io


def cryptographic_seal(
	embedded_image: bytes,
	password: str = None,
	key: bytes = None,
	alpha_layer: bytes = None,
	kdf_iterations: int = 100_000
) -> dict:
	"""
	Applies cryptographic sealing to the embedded image using PyCryptodome (AES-GCM).
	Supports password-based key derivation (PBKDF2) and optional Pillow alpha-layer compositing.
	Returns sealed image and full cryptographic metadata.
	"""
	import logging
	try:
		# Compose alpha layer if provided
		composite_bytes = embedded_image
		if alpha_layer:
			try:
				img = Image.open(io.BytesIO(embedded_image)).convert("RGBA")
				alpha = Image.open(io.BytesIO(alpha_layer)).convert("L")
				img.putalpha(alpha)
				buf = io.BytesIO()
				img.save(buf, format="PNG")
				composite_bytes = buf.getvalue()
			except Exception:
				pass

		# Key derivation
		salt = get_random_bytes(16)
		if password:
			derived_key = PBKDF2(password, salt, dkLen=32, count=kdf_iterations)
			key_used = derived_key
		elif key:
			key_used = key.ljust(32, b'0')[:32]
		else:
			raise ValueError("Must provide either a password or a key for cryptographic sealing.")

		nonce = get_random_bytes(12)
		cipher = AES.new(key_used, AES.MODE_GCM, nonce=nonce)
		sealed_image, tag = cipher.encrypt_and_digest(composite_bytes)
		crypto_metadata = {
			"nonce": nonce.hex(),
			"tag": tag.hex(),
			"mode": "AES-GCM",
			"salt": salt.hex(),
			"kdf_iterations": kdf_iterations if password else None,
			"password_based": bool(password),
		}
		return {
			"sealed_image": sealed_image,
			"crypto_metadata": crypto_metadata,
		}
	except Exception as e:
		logging.exception("Cryptographic sealing failed")
		raise RuntimeError(f"Cryptographic sealing failed: {e}")


# Unsealing logic for reversal pipeline
def cryptographic_unseal(
	sealed_image: bytes,
	password: str = None,
	key: bytes = None,
	nonce: str = None,
	tag: str = None,
	salt: str = None,
	kdf_iterations: int = 100_000
) -> dict:
	"""
	Decrypts the sealed image using PyCryptodome (AES-GCM) and provided metadata.
	Returns the unsealed image bytes.
	"""
	import logging
	try:
		if password and salt:
			derived_key = PBKDF2(password, bytes.fromhex(salt), dkLen=32, count=kdf_iterations)
			key_used = derived_key
		elif key:
			key_used = key.ljust(32, b'0')[:32]
		else:
			raise ValueError("Must provide either a password (with salt) or a key for unsealing.")

		cipher = AES.new(key_used, AES.MODE_GCM, nonce=bytes.fromhex(nonce))
		unsealed_image = cipher.decrypt_and_verify(sealed_image, bytes.fromhex(tag))
		return {
			"unsealed_image": unsealed_image
		}
	except Exception as e:
		logging.exception("Cryptographic unsealing failed")
		raise RuntimeError(f"Cryptographic unsealing failed: {e}")
