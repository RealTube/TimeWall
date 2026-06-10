//! Encryption-at-rest for the sensitive activity text.
//!
//! A 256-bit key is generated once and stored in the OS keychain (Windows
//! Credential Manager / macOS Keychain) via the `keyring` crate. Every activity
//! description is sealed with XChaCha20-Poly1305 (AEAD, 24-byte random nonce)
//! before it ever touches disk, so the database file on disk is ciphertext and
//! the key never lives in any plaintext file alongside it.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Key, XChaCha20Poly1305, XNonce,
};
use keyring::Entry;

const KEYRING_SERVICE: &str = "com.gevor.reality-check";
const KEYRING_USER: &str = "db-encryption-key";
const NONCE_LEN: usize = 24;

/// Holds the initialized AEAD cipher. Cheap to clone-share; `Send + Sync`.
pub struct Crypto {
    cipher: XChaCha20Poly1305,
}

impl Crypto {
    /// Load the key from the OS keychain, generating and storing one on first run.
    pub fn load_or_create() -> Result<Self, String> {
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|e| format!("keychain entry error: {e}"))?;

        let key_bytes: Vec<u8> = match entry.get_password() {
            Ok(b64) => STANDARD
                .decode(b64)
                .map_err(|e| format!("stored key decode error: {e}"))?,
            Err(keyring::Error::NoEntry) => {
                let key = XChaCha20Poly1305::generate_key(&mut OsRng);
                entry
                    .set_password(&STANDARD.encode(key))
                    .map_err(|e| format!("keychain store error: {e}"))?;
                key.to_vec()
            }
            Err(e) => return Err(format!("keychain read error: {e}")),
        };

        if key_bytes.len() != 32 {
            return Err("encryption key has unexpected length".into());
        }
        let key = Key::from_slice(&key_bytes);
        Ok(Self {
            cipher: XChaCha20Poly1305::new(key),
        })
    }

    /// Seal plaintext into a `nonce || ciphertext` blob suitable for a BLOB column.
    pub fn encrypt(&self, plaintext: &str) -> Result<Vec<u8>, String> {
        let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
        let ciphertext = self
            .cipher
            .encrypt(&nonce, plaintext.as_bytes())
            .map_err(|_| "encryption failed".to_string())?;
        let mut blob = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        blob.extend_from_slice(nonce.as_slice());
        blob.extend_from_slice(&ciphertext);
        Ok(blob)
    }

    /// Open a `nonce || ciphertext` blob back into its plaintext string.
    pub fn decrypt(&self, blob: &[u8]) -> Result<String, String> {
        if blob.len() < NONCE_LEN {
            return Err("ciphertext too short".into());
        }
        let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
        let nonce = XNonce::from_slice(nonce_bytes);
        let plaintext = self
            .cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| "decryption failed".to_string())?;
        String::from_utf8(plaintext).map_err(|e| format!("utf8 error: {e}"))
    }

    /// Build a cipher from a fixed key without touching the keychain. Tests only.
    #[cfg(test)]
    pub fn test_fixed() -> Self {
        let key = Key::from_slice(&[7u8; 32]);
        Self {
            cipher: XChaCha20Poly1305::new(key),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_text() {
        let c = Crypto::test_fixed();
        let blob = c.encrypt("Wrote sales email").unwrap();
        assert_ne!(blob.as_slice(), b"Wrote sales email"); // not plaintext
        assert_eq!(c.decrypt(&blob).unwrap(), "Wrote sales email");
    }

    #[test]
    fn unique_nonces_per_encryption() {
        let c = Crypto::test_fixed();
        assert_ne!(c.encrypt("same").unwrap(), c.encrypt("same").unwrap());
    }

    #[test]
    fn rejects_tampering() {
        let c = Crypto::test_fixed();
        let mut blob = c.encrypt("secret").unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0xff;
        assert!(c.decrypt(&blob).is_err());
    }
}
