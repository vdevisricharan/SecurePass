// Production Background service worker for Secure Pass
importScripts('crypto-utils.js');

class ProductionSecurePass {
  constructor() {
    this.sessionTimeout = 15 * 60 * 1000; // 15 minutes
    this.crypto = new CryptoUtils();
    this.biometricSupported = false;
    this.init();
  }

  async init() {
    // Set up default settings on install
    chrome.runtime.onInstalled.addListener(this.onInstalled.bind(this));
    
    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    
    // Monitor tab changes to check session timeout
    chrome.tabs.onActivated.addListener(this.checkSession.bind(this));
    chrome.tabs.onUpdated.addListener(this.checkSession.bind(this));

    // Check biometric support
    this.biometricSupported = await this.checkBiometricSupport();
  }

  async onInstalled(details) {
    if (details.reason === 'install') {
      await chrome.storage.local.set({
        isEnabled: true,
        sessionTimeout: this.sessionTimeout,
        masterPasswordHash: null,
        masterPasswordSalt: null,
        isAuthenticated: false,
        lastActivity: 0,
        protectionLevel: 'medium',
        biometricEnabled: false,
        totpEnabled: false,
        totpSecret: null,
        encryptionEnabled: true,
        version: '2.0.0'
      });
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'CHECK_AUTH_STATUS':
          const authStatus = await this.checkAuthStatus();
          sendResponse({ authenticated: authStatus });
          break;

        case 'AUTHENTICATE':
          const result = await this.authenticate(message.password, message.totpToken, message.biometric);
          sendResponse({ success: result.success, error: result.error });
          break;

        case 'SET_MASTER_PASSWORD':
          await this.setMasterPassword(message.password);
          sendResponse({ success: true });
          break;

        case 'UPDATE_SETTINGS':
          await this.updateSettings(message.settings);
          sendResponse({ success: true });
          break;

        case 'GET_SETTINGS':
          const settings = await this.getSettings();
          sendResponse(settings);
          break;

        case 'LOGOUT':
          await this.logout();
          sendResponse({ success: true });
          break;

        case 'SETUP_TOTP':
          const totpResult = await this.setupTOTP();
          sendResponse(totpResult);
          break;

        case 'VERIFY_TOTP':
          const totpValid = await this.verifyTOTP(message.token);
          sendResponse({ valid: totpValid });
          break;

        case 'DISABLE_2FA':
          await this.disable2FA(message.method);
          sendResponse({ success: true });
          break;

        case 'EXPORT_BACKUP':
          const backup = await this.exportBackup(message.password);
          sendResponse(backup);
          break;

        case 'IMPORT_BACKUP':
          const importResult = await this.importBackup(message.backup, message.password);
          sendResponse(importResult);
          break;

        case 'STORE_BIOMETRIC_CREDENTIAL':
          await chrome.storage.local.set({
            biometricEnabled: true,
            biometricCredentialId: message.credentialId
          });
          sendResponse({ success: true });
          break;

        case 'DISABLE_BIOMETRIC':
          await chrome.storage.local.set({
            biometricEnabled: false,
            biometricCredentialId: null
          });
          sendResponse({ success: true });
          break;
      }
    } catch (error) {
      console.error('Background script error:', error, error.stack);
      sendResponse({ success: false, error: error.message });
    }
  }

  async checkAuthStatus() {
    const data = await chrome.storage.local.get(['isAuthenticated', 'lastActivity', 'sessionTimeout']);
    
    if (!data.isAuthenticated) return false;
    
    const now = Date.now();
    if (now - data.lastActivity > data.sessionTimeout) {
      await this.logout();
      return false;
    }
    
    // Update last activity
    await chrome.storage.local.set({ lastActivity: now });
    return true;
  }

  async authenticate(inputPassword, totpToken = null, useBiometric = false) {
    const data = await chrome.storage.local.get([
      'masterPasswordHash', 'masterPasswordSalt', 'totpEnabled', 'totpSecret', 'biometricEnabled'
    ]);
    
    if (!data.masterPasswordHash) {
      // First time setup
      await this.setMasterPassword(inputPassword);
      return { success: true };
    }

    // Verify master password
    const isValidPassword = await this.crypto.verifyPassword(
      inputPassword, 
      data.masterPasswordHash, 
      data.masterPasswordSalt
    );
    
    if (!isValidPassword) {
      return { success: false, error: 'Invalid master password' };
    }

    // Check TOTP if enabled
    if (data.totpEnabled && data.totpSecret && !useBiometric) {
      if (!totpToken) {
        return { success: false, error: 'TOTP token required', requiresTOTP: true };
      }
      
      const decryptedSecret = await this.decryptSensitiveData(data.totpSecret, inputPassword);
      const isValidTOTP = await this.crypto.verifyTOTP(decryptedSecret, totpToken);
      
      if (!isValidTOTP) {
        return { success: false, error: 'Invalid TOTP token' };
      }
    }

    // Set authenticated state
    await chrome.storage.local.set({
      isAuthenticated: true,
      lastActivity: Date.now()
    });
    
    return { success: true };
  }

  async setMasterPassword(password) {
    const hashResult = await this.crypto.hashPassword(password);
    await chrome.storage.local.set({
      masterPasswordHash: hashResult.hash,
      masterPasswordSalt: hashResult.salt,
      isAuthenticated: true,
      lastActivity: Date.now()
    });
  }

  async setupTOTP() {
    const secret = this.crypto.generateTOTPSecret();
    const data = await chrome.storage.local.get(['masterPasswordHash']);
    
    if (!data.masterPasswordHash) {
      return { success: false, error: 'Master password must be set first' };
    }

    // Get master password from user (this would need to be handled in UI)
    // For now, we'll store the secret encrypted with a derived key
    const encryptedSecret = await this.encryptSensitiveData(secret, 'temp_password');
    
    await chrome.storage.local.set({
      totpSecret: encryptedSecret,
      totpEnabled: false // Will be enabled after verification
    });

    return { 
      success: true, 
      secret: secret,
      qrCodeUrl: `otpauth://totp/Password%20Guard?secret=${secret}&issuer=Password%20Guard`
    };
  }

  async verifyTOTP(token) {
    const data = await chrome.storage.local.get(['totpSecret']);
    if (!data.totpSecret) return false;

    try {
      const decryptedSecret = await this.decryptSensitiveData(data.totpSecret, 'temp_password');
      return await this.crypto.verifyTOTP(decryptedSecret, token);
    } catch (error) {
      return false;
    }
  }

  async encryptSensitiveData(data, password) {
    return await this.crypto.encryptData(data, password);
  }

  async decryptSensitiveData(encryptedData, password) {
    return await this.crypto.decryptData(encryptedData, password);
  }

  async updateSettings(settings) {
    // Validate settings before storing
    const validSettings = {};
    const allowedKeys = [
      'isEnabled', 'sessionTimeout', 'protectionLevel', 
      'biometricEnabled', 'totpEnabled', 'encryptionEnabled'
    ];
    
    for (const [key, value] of Object.entries(settings)) {
      if (allowedKeys.includes(key)) {
        validSettings[key] = value;
      }
    }
    
    await chrome.storage.local.set(validSettings);
  }

  async getSettings() {
    const settings = await chrome.storage.local.get();
    // Remove sensitive data from settings response
    const safeSettings = { ...settings };
    delete safeSettings.masterPasswordHash;
    delete safeSettings.masterPasswordSalt;
    delete safeSettings.totpSecret;
    delete safeSettings.biometricCredentialId;
    
    return safeSettings;
  }

  async logout() {
    await chrome.storage.local.set({
      isAuthenticated: false,
      lastActivity: 0
    });
  }

  async disable2FA(method) {
    if (method === 'totp') {
      await chrome.storage.local.set({
        totpEnabled: false,
        totpSecret: null
      });
    } else if (method === 'biometric') {
      await chrome.storage.local.set({
        biometricEnabled: false,
        biometricCredentialId: null
      });
    }
  }

  async exportBackup(password) {
    try {
      const data = await chrome.storage.local.get();
      const backupData = {
        settings: {
          isEnabled: data.isEnabled,
          sessionTimeout: data.sessionTimeout,
          protectionLevel: data.protectionLevel,
          biometricEnabled: data.biometricEnabled,
          totpEnabled: data.totpEnabled
        },
        security: {
          masterPasswordHash: data.masterPasswordHash,
          masterPasswordSalt: data.masterPasswordSalt,
          totpSecret: data.totpSecret
        },
        timestamp: Date.now(),
        version: '2.0.0'
      };

      const encrypted = await this.crypto.encryptData(backupData, password);
      return {
        success: true,
        backup: JSON.stringify(encrypted)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async importBackup(backupString, password) {
    try {
      const backupData = JSON.parse(backupString);
      const decrypted = await this.crypto.decryptData(backupData, password);
      
      // Validate backup structure
      if (!decrypted.settings || !decrypted.security) {
        throw new Error('Invalid backup format');
      }

      // Restore settings and security data
      await chrome.storage.local.set({
        ...decrypted.settings,
        ...decrypted.security,
        isAuthenticated: false,
        lastActivity: 0
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async checkBiometricSupport() {
    try {
      return !!(window.PublicKeyCredential && 
                await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch {
      return false;
    }
  }

  async checkSession() {
    const isAuth = await this.checkAuthStatus();
    if (!isAuth) {
      // Notify all tabs about authentication status change
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'AUTH_STATUS_CHANGED', authenticated: false })
          .catch(() => {}); // Ignore errors for tabs that don't have content script
      });
    }
  }
}

// Initialize the production Secure Pass
new ProductionSecurePass();