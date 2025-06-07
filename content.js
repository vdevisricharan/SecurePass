// Content script for Secure Pass
class SecurePassContent {
  constructor() {
    this.isEnabled = true;
    this.protectedInputs = new Set();
    this.authModal = null;
    this.init();
  }

  async init() {
    // Get extension settings
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    this.isEnabled = response.isEnabled;
    this.protectionLevel = response.protectionLevel || 'medium';

    if (!this.isEnabled) return;

    // Set up password field protection
    this.setupPasswordProtection();
    
    // Listen for dynamic content changes
    this.observeDOM();
    
    // Listen for auth status changes
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }

  handleMessage(message, sender, sendResponse) {
    if (message.type === 'AUTH_STATUS_CHANGED' && !message.authenticated) {
      this.clearProtectedInputs();
    }
  }

  setupPasswordProtection() {
    // Find all password inputs and potential autofill targets
    const selectors = [
      'input[type="password"]',
      'input[autocomplete*="password"]',
      'input[name*="password" i]',
      'input[id*="password" i]'
    ];

    if (this.protectionLevel === 'high') {
      // Also protect username fields in high security mode
      selectors.push(
        'input[type="email"]',
        'input[autocomplete="username"]',
        'input[autocomplete="email"]',
        'input[name*="username" i]',
        'input[name*="email" i]'
      );
    }

    const inputs = document.querySelectorAll(selectors.join(','));
    inputs.forEach(input => this.protectInput(input));
  }

  protectInput(input) {
    if (this.protectedInputs.has(input)) return;

    this.protectedInputs.add(input);

    // Disable autofill initially
    input.setAttribute('data-original-autocomplete', input.getAttribute('autocomplete') || '');
    input.setAttribute('autocomplete', 'off');

    // Add event listeners
    input.addEventListener('focus', this.onInputFocus.bind(this));
    input.addEventListener('input', this.onInputChange.bind(this));
  }

  async onInputFocus(event) {
    const input = event.target;
    
    // Check if user is authenticated
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH_STATUS' });
    
    if (!response.authenticated) {
      // Prevent autofill and show authentication modal
      event.preventDefault();
      input.blur();
      this.showAuthModal(input);
    } else {
      // Re-enable autofill for authenticated user
      const originalAutocomplete = input.getAttribute('data-original-autocomplete');
      input.setAttribute('autocomplete', originalAutocomplete || 'on');
    }
  }

  onInputChange(event) {
    const input = event.target;
    
    // If user starts typing manually, allow it
    // This handles cases where they want to type password manually
    if (input.value.length > 0) {
      const originalAutocomplete = input.getAttribute('data-original-autocomplete');
      input.setAttribute('autocomplete', originalAutocomplete || 'on');
    }
  }

  async showAuthModal(targetInput) {
    if (this.authModal) {
      this.authModal.remove();
    }

    // Check if 2FA is required
    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const requiresTOTP = settings.totpEnabled;
    const biometricAvailable = settings.biometricEnabled;

    // Create modal HTML
    const modalHTML = 
    `
      <div id="password-guard-modal" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          background: white;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          max-width: 420px;
          width: 90%;
          text-align: center;
        ">
          <div style="
            width: 64px;
            height: 64px;
            background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
            border-radius: 50%;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
          ">🔒</div>
          
          <h2 style="
            margin: 0 0 10px 0;
            color: #1F2937;
            font-size: 24px;
            font-weight: 600;
          ">Secure Authentication</h2>
          
          <p style="
            margin: 0 0 25px 0;
            color: #6B7280;
            font-size: 16px;
            line-height: 1.5;
          ">Enter your credentials to access saved passwords</p>
          
          <div style="margin-bottom: 20px;">
            <input 
              type="password" 
              id="master-password-input"
              placeholder="Master password"
              style="
                width: 100%;
                padding: 12px 16px;
                border: 2px solid #E5E7EB;
                border-radius: 8px;
                font-size: 16px;
                box-sizing: border-box;
                outline: none;
                transition: border-color 0.2s;
                margin-bottom: 12px;
              "
            />

            ${requiresTOTP ? `
              <input 
                type="text" 
                id="totp-token-input"
                placeholder="6-digit TOTP code"
                maxlength="6"
                style="
                  width: 100%;
                  padding: 12px 16px;
                  border: 2px solid #E5E7EB;
                  border-radius: 8px;
                  font-size: 16px;
                  box-sizing: border-box;
                  outline: none;
                  transition: border-color 0.2s;
                  text-align: center;
                  letter-spacing: 0.5em;
                  font-family: monospace;
                "
              />
            ` : ''}
          </div>
          
          <div id="error-message" style="
            color: #EF4444;
            font-size: 14px;
            margin-bottom: 15px;
            display: none;
          "></div>
          
          <div style="display: flex; gap: 12px; margin-bottom: ${biometricAvailable ? '15px' : '0'};">
            <button id="cancel-auth" style="
              flex: 1;
              padding: 12px 24px;
              background: #F3F4F6;
              color: #374151;
              border: none;
              border-radius: 8px;
              font-size: 16px;
              font-weight: 500;
              cursor: pointer;
              transition: background-color 0.2s;
            ">Cancel</button>
            
            <button id="confirm-auth" style="
              flex: 1;
              padding: 12px 24px;
              background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
              color: white;
              border: none;
              border-radius: 8px;
              font-size: 16px;
              font-weight: 500;
              cursor: pointer;
              transition: opacity 0.2s;
            ">Unlock</button>
          </div>

          ${biometricAvailable ? `
            <div style="
              padding-top: 15px;
              border-top: 1px solid #E5E7EB;
            ">
              <button id="biometric-auth" style="
                width: 100%;
                padding: 12px 16px;
                background: #059669;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: background-color 0.2s;
              ">
                <span>🔐</span>
                Use Biometric Authentication
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    // Add modal to page
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    this.authModal = modalContainer.firstElementChild;
    document.body.appendChild(this.authModal);

    // Set up event listeners
    const passwordInput = this.authModal.querySelector('#master-password-input');
    const totpInput = this.authModal.querySelector('#totp-token-input');
    const confirmBtn = this.authModal.querySelector('#confirm-auth');
    const cancelBtn = this.authModal.querySelector('#cancel-auth');
    const errorDiv = this.authModal.querySelector('#error-message');
    const biometricBtn = this.authModal.querySelector('#biometric-auth');

    passwordInput.focus();

    // Handle authentication
    const authenticate = async () => {
      const password = passwordInput.value;
      const totp = totpInput ? totpInput.value : undefined;
      if (!password || (requiresTOTP && !totp)) {
        errorDiv.textContent = 'Please enter all required fields.';
        errorDiv.style.display = 'block';
        return;
      }

      confirmBtn.textContent = 'Checking...';
      confirmBtn.disabled = true;
      if (biometricBtn) biometricBtn.disabled = true;

      const response = await chrome.runtime.sendMessage({
        type: 'AUTHENTICATE',
        password: password,
        totp: totp
      });

      if (response.success) {
        this.authModal.remove();
        this.authModal = null;
        // Re-enable autofill and focus the original input
        const originalAutocomplete = targetInput.getAttribute('data-original-autocomplete');
        targetInput.setAttribute('autocomplete', originalAutocomplete || 'on');
        targetInput.focus();
      } else {
        errorDiv.textContent = response.error || 'Invalid credentials. Please try again.';
        errorDiv.style.display = 'block';
        passwordInput.value = '';
        if (totpInput) totpInput.value = '';
        passwordInput.focus();
        confirmBtn.textContent = 'Unlock';
        confirmBtn.disabled = false;
        if (biometricBtn) biometricBtn.disabled = false;
      }
    };

    confirmBtn.addEventListener('click', authenticate);
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') authenticate();
    });
    if (totpInput) {
      totpInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') authenticate();
      });
    }

    cancelBtn.addEventListener('click', () => {
      this.authModal.remove();
      this.authModal = null;
    });

    // Biometric authentication
    if (biometricBtn) {
      biometricBtn.addEventListener('click', async () => {
        biometricBtn.textContent = 'Waiting...';
        biometricBtn.disabled = true;
        confirmBtn.disabled = true;
        try {
          const response = await chrome.runtime.sendMessage({ type: 'BIOMETRIC_AUTH' });
          if (response.success) {
            this.authModal.remove();
            this.authModal = null;
            // Re-enable autofill and focus the original input
            const originalAutocomplete = targetInput.getAttribute('data-original-autocomplete');
            targetInput.setAttribute('autocomplete', originalAutocomplete || 'on');
            targetInput.focus();
          } else {
            errorDiv.textContent = response.error || 'Biometric authentication failed.';
            errorDiv.style.display = 'block';
            biometricBtn.textContent = 'Use Biometric Authentication';
            biometricBtn.disabled = false;
            confirmBtn.disabled = false;
          }
        } catch (e) {
          errorDiv.textContent = 'Biometric authentication error.';
          errorDiv.style.display = 'block';
          biometricBtn.textContent = 'Use Biometric Authentication';
          biometricBtn.disabled = false;
          confirmBtn.disabled = false;
        }
      });
    }

    // Close modal when clicking outside
    this.authModal.addEventListener('click', (e) => {
      if (e.target === this.authModal) {
        this.authModal.remove();
        this.authModal = null;
      }
    });
  }

  clearProtectedInputs() {
    // Disable autofill on all protected inputs when session expires
    this.protectedInputs.forEach(input => {
      if (input.isConnected) {
        input.setAttribute('autocomplete', 'off');
      }
    });
  }

  observeDOM() {
    // Watch for dynamically added password fields
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const inputs = node.querySelectorAll ? 
              node.querySelectorAll('input[type="password"], input[autocomplete*="password"]') : [];
            inputs.forEach(input => this.protectInput(input));
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new SecurePassContent());
} else {
  new SecurePassContent();
}

// Biometric/WebAuthn logic in content script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'SETUP_BIOMETRIC') {
    if (!window.PublicKeyCredential) {
      sendResponse({ success: false, error: 'WebAuthn not supported' });
      return;
    }
    try {
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array(32),
          rp: { name: 'Secure Pass' },
          user: {
            id: new Uint8Array(16),
            name: 'user@securepass',
            displayName: 'Secure Pass User'
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 60000,
          attestation: 'direct'
        }
      });
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      await chrome.runtime.sendMessage({
        type: 'STORE_BIOMETRIC_CREDENTIAL',
        credentialId
      });
      sendResponse({ success: true });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true; // Indicates async response
  }
  if (message.type === 'BIOMETRIC_AUTH') {
    if (!window.PublicKeyCredential) {
      sendResponse({ success: false, error: 'WebAuthn not supported' });
      return;
    }
    try {
      const { credentialId } = message;
      const rawId = Uint8Array.from(atob(credentialId), c => c.charCodeAt(0));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: new Uint8Array(32),
          allowCredentials: [{ id: rawId, type: 'public-key' }],
          userVerification: 'required',
          timeout: 60000
        }
      });
      sendResponse({ success: true });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }
});