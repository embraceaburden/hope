
# Unlock and decrypt the image using PyCryptodome (AES-GCM), with password or key support
from typing import Any
from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
import logging

def unlock_and_decrypt(
	sealed_image: bytes,
	password: str = None,
	key: bytes = None,
	nonce: str = None,
	tag: str = None,
	salt: str = None,
	kdf_iterations: int = 100_000
) -> dict:
	"""
	Unlocks and decrypts the sealed image using PyCryptodome (AES-GCM).
	Supports password-based key derivation (PBKDF2) or direct key.
	Requires nonce and tag (hex strings) from encryption metadata.
	Returns a dict with the decrypted image.
	"""
	if nonce is None or tag is None:
		raise ValueError("Nonce and tag are required for AES-GCM decryption.")
	try:
		if password and salt:
			derived_key = PBKDF2(password, bytes.fromhex(salt), dkLen=32, count=kdf_iterations)
			key_used = derived_key
		elif key:
			key_used = key.ljust(32, b'0')[:32]
		else:
			raise ValueError("Must provide either a password (with salt) or a key for decryption.")
		nonce_bytes = bytes.fromhex(nonce)
		tag_bytes = bytes.fromhex(tag)
		cipher = AES.new(key_used, AES.MODE_GCM, nonce=nonce_bytes)
		decrypted_image = cipher.decrypt_and_verify(sealed_image, tag_bytes)
		return {"decrypted_image": decrypted_image}
	except Exception as e:
		logging.exception("Cryptographic unlock/decrypt failed")
		raise RuntimeError(f"Cryptographic unlock/decrypt failed: {e}")
