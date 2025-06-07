// Production-grade cryptography utilities
class CryptoUtils {
  constructor() {
    this.PBKDF2_ITERATIONS = 100000; // OWASP recommended minimum
    this.SALT_LENGTH = 32; // 256 bits
    this.KEY_LENGTH = 32; // 256 bits
    this.IV_LENGTH = 16; // 128 bits for AES-GCM
    this.TAG_LENGTH = 16; // 128 bits for AES-GCM
  }

  /**
   * Generate cryptographically secure random bytes
   */
  generateRandomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  /**
   * Generate salt for password hashing
   */
  generateSalt() {
    return this.generateRandomBytes(this.SALT_LENGTH);
  }

  /**
   * Derive key using PBKDF2
   */
  async deriveKey(password, salt, iterations = this.PBKDF2_ITERATIONS) {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    
    // Import password as raw key
    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      true,
      ['deriveBits', 'deriveKey']
    );

    // Derive key using PBKDF2
    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256'
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Hash password with salt using PBKDF2
   */
  async hashPassword(password, salt = null) {
    if (!salt) {
      salt = this.generateSalt();
    }
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // Import password as raw key (extractable: false, as required)
    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    // Derive bits for hash
    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      baseKey,
      256 // bits
    );

    return {
      hash: Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join(''),
      salt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
      iterations: this.PBKDF2_ITERATIONS
    };
  }

  /**
   * Verify password against stored hash
   */
  async verifyPassword(password, storedHash, storedSalt, iterations = this.PBKDF2_ITERATIONS) {
    const salt = new Uint8Array(storedSalt.match(/.{2}/g).map(byte => parseInt(byte, 16)));
    const result = await this.hashPassword(password, salt);
    return result.hash === storedHash;
  }

  /**
   * Encrypt data using AES-GCM
   */
  async encryptData(data, password) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));
    
    const salt = this.generateSalt();
    const key = await this.deriveKey(password, salt);
    const iv = this.generateRandomBytes(this.IV_LENGTH);
    
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      dataBuffer
    );
    
    return {
      encrypted: Array.from(new Uint8Array(encryptedBuffer)).map(b => b.toString(16).padStart(2, '0')).join(''),
      salt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
      iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')
    };
  }

  /**
   * Decrypt data using AES-GCM
   */
  async decryptData(encryptedData, password) {
    const salt = new Uint8Array(encryptedData.salt.match(/.{2}/g).map(byte => parseInt(byte, 16)));
    const iv = new Uint8Array(encryptedData.iv.match(/.{2}/g).map(byte => parseInt(byte, 16)));
    const encrypted = new Uint8Array(encryptedData.encrypted.match(/.{2}/g).map(byte => parseInt(byte, 16)));
    
    const key = await this.deriveKey(password, salt);
    
    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        encrypted
      );
      
      const decoder = new TextDecoder();
      const decryptedString = decoder.decode(decryptedBuffer);
      return JSON.parse(decryptedString);
    } catch (error) {
      throw new Error('Decryption failed - invalid password or corrupted data');
    }
  }

  /**
   * Generate TOTP secret
   */
  generateTOTPSecret() {
    const secret = this.generateRandomBytes(20); // 160 bits
    return this.base32Encode(secret);
  }

  /**
   * Base32 encoding for TOTP secrets
   */
  base32Encode(buffer) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';
    
    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;
      
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    
    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }
    
    return output;
  }

  /**
   * Base32 decoding for TOTP secrets
   */
  base32Decode(encoded) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = [];
    
    for (let i = 0; i < encoded.length; i++) {
      const char = encoded[i].toUpperCase();
      const index = alphabet.indexOf(char);
      if (index === -1) continue;
      
      value = (value << 5) | index;
      bits += 5;
      
      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    
    return new Uint8Array(output);
  }

  /**
   * Generate TOTP token
   */
  async generateTOTP(secret, timeStep = 30, digits = 6) {
    const key = this.base32Decode(secret);
    const time = Math.floor(Date.now() / 1000 / timeStep);
    
    // Convert time to 8-byte array
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setUint32(4, time, false);
    
    // Import HMAC key
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    
    // Generate HMAC
    const hmac = await crypto.subtle.sign('HMAC', hmacKey, timeBuffer);
    const hmacArray = new Uint8Array(hmac);
    
    // Dynamic truncation
    const offset = hmacArray[hmacArray.length - 1] & 0x0f;
    const code = (
      ((hmacArray[offset] & 0x7f) << 24) |
      ((hmacArray[offset + 1] & 0xff) << 16) |
      ((hmacArray[offset + 2] & 0xff) << 8) |
      (hmacArray[offset + 3] & 0xff)
    ) % Math.pow(10, digits);
    
    return code.toString().padStart(digits, '0');
  }

  /**
   * Verify TOTP token with time window tolerance
   */
  async verifyTOTP(secret, token, timeStep = 30, window = 1) {
    for (let i = -window; i <= window; i++) {
      const time = Math.floor(Date.now() / 1000 / timeStep) + i;
      
      const timeBuffer = new ArrayBuffer(8);
      const timeView = new DataView(timeBuffer);
      timeView.setUint32(4, time, false);
      
      const key = this.base32Decode(secret);
      const hmacKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
      );
      
      const hmac = await crypto.subtle.sign('HMAC', hmacKey, timeBuffer);
      const hmacArray = new Uint8Array(hmac);
      
      const offset = hmacArray[hmacArray.length - 1] & 0x0f;
      const code = (
        ((hmacArray[offset] & 0x7f) << 24) |
        ((hmacArray[offset + 1] & 0xff) << 16) |
        ((hmacArray[offset + 2] & 0xff) << 8) |
        (hmacArray[offset + 3] & 0xff)
      ) % 1000000;
      
      const expectedToken = code.toString().padStart(6, '0');
      if (expectedToken === token) {
        return true;
      }
    }
    return false;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CryptoUtils;
} else if (typeof window !== 'undefined') {
  window.CryptoUtils = CryptoUtils;
}