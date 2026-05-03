import os
import base64
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.fernet import Fernet
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=PROJECT_ROOT / ".env")

ENCRYPTION_KEY_B64 = os.getenv('ENCRYPTION_KEY')
if not ENCRYPTION_KEY_B64:
    # Fallback or error? Spec says AES-256 is mandatory.
    raise ValueError("ENCRYPTION_KEY must be set in .env for PRO System v2.0")

# Decode the base64 key
# Fernet keys are 32 random bytes, base64 encoded. 
# AESGCM with a 256-bit key also requires exactly 32 bytes.
try:
    # Fernet.generate_key() produces a 32-byte key base64 encoded.
    # We decode it to get the raw 32 bytes for AES-256.
    key_bytes = base64.urlsafe_b64decode(ENCRYPTION_KEY_B64)
    if len(key_bytes) != 32:
        # If the key isn't 32 bytes, we might need to pad or hash it, 
        # but standard PRO keys should be 32 bytes.
        import hashlib
        key_bytes = hashlib.sha256(key_bytes).digest()
except Exception:
    # If decoding fails, we use a hash of the string to ensure 32 bytes.
    import hashlib
    key_bytes = hashlib.sha256(ENCRYPTION_KEY_B64.encode()).digest()

aesgcm = AESGCM(key_bytes)
# Keep legacy cipher for decrypting old data
legacy_cipher = Fernet(ENCRYPTION_KEY_B64.encode())

def encrypt_data(data: str) -> str:
    """
    Encrypts a string using AES-256-GCM (Mandatory for PRO v2.0).
    Returns a base64 encoded string with a 'v2:' prefix for identification.
    """
    if not data:
        return ""
    
    nonce = os.urandom(12)  # GCM recommended nonce size is 12 bytes
    ciphertext = aesgcm.encrypt(nonce, data.encode(), None)
    
    # Combine nonce + ciphertext and encode
    combined = nonce + ciphertext
    return "v2:" + base64.b64encode(combined).decode()

def decrypt_data(encrypted_data: str) -> str:
    """
    Decrypts a base64 encoded string.
    Supports both 'v2:' (AES-256-GCM) and legacy (Fernet/AES-128) formats.
    """
    if not encrypted_data:
        return ""
    
    # Check for v2 prefix
    if isinstance(encrypted_data, str) and encrypted_data.startswith("v2:"):
        try:
            raw_data = base64.b64decode(encrypted_data[3:])
            nonce = raw_data[:12]
            ciphertext = raw_data[12:]
            decrypted = aesgcm.decrypt(nonce, ciphertext, None).decode()
            return decrypted
        except Exception as e:
            print(f"[Encryption] AES-256-GCM decryption failed: {e}")
            return encrypted_data # Fallback to raw if decryption fails

    # Try legacy Fernet decryption
    try:
        return legacy_cipher.decrypt(encrypted_data.encode() if isinstance(encrypted_data, str) else encrypted_data).decode()
    except Exception:
        # If decryption fails (e.g., data wasn't encrypted), return as is for backward compatibility
        # print(f"[Encryption] Legacy decryption failed for {str(encrypted_data)[:10]}...")
        return encrypted_data
