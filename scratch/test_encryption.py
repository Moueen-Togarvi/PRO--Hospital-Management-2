import sys
import os

# Add the project root to sys.path
sys.path.append('/home/moueen-togarvi/code/company/PRO--irfan-hostpital')

from services.encryption import encrypt_data, decrypt_data

def test_encryption():
    test_str = "Hello PRO v2.0"
    encrypted = encrypt_data(test_str)
    print(f"Encrypted: {encrypted}")
    
    if not encrypted.startswith("v2:"):
        print("FAILED: No v2: prefix")
        return
    
    decrypted = decrypt_data(encrypted)
    print(f"Decrypted: {decrypted}")
    
    if test_str == decrypted:
        print("SUCCESS: Encryption/Decryption verified.")
    else:
        print("FAILED: Decryption mismatch.")

    # Test legacy (if I had a Fernet string)
    # legacy_str = ... 
    # decrypted_legacy = decrypt_data(legacy_str)
    # ...

if __name__ == "__main__":
    test_encryption()
