// Popup script for Secure Pass
class PopupManager {
  constructor() {
    this.settings = {};
    this.sessionTimer = null;
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.updateUI();
    this.startSessionTimer();
  }

  async loadSettings() {
    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    this.settings = settings || {};
  }

  setupEventListeners() {
    // Enable/disable toggle
    document.getElementById('enableToggle').addEventListener('change', (e) => {
      this.updateSetting('isEnabled', e.target.checked);
    });

    // Protection level
    document.getElementById('protectionLevel').addEventListener('change', (e) => {
      this.updateSetting('protectionLevel', e.target.value);
    });

    // Session timeout
    document.getElementById('sessionTimeout').addEventListener('change', (e) => {
      this.updateSetting('sessionTimeout', parseInt(e.target.value));
    });

    // Change master password
    document.getElementById('changeMasterPassword').addEventListener('click', () => {
      this.showPasswordChangeDialog();
    });

    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'LOGOUT' });
      this.updateUI();
    });

    // Setup Biometric
    document.getElementById('setupBiometricBtn').addEventListener('click', async () => {
      const tab = await getActiveTabWithContentScript();
      if (!tab) {
        alert('Please open a regular website tab and try again.');
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'SETUP_BIOMETRIC' }, async (response) => {
        if (chrome.runtime.lastError) {
          alert('Could not communicate with content script. Make sure you have a tab open.');
          return;
        }
        if (response && response.success) {
          alert('Biometric setup successful!');
          await this.loadSettings();
          this.updateUI();
        } else {
          alert('Biometric setup failed: ' + (response && response.error ? response.error : 'Unknown error'));
        }
      });
    });

    // Use Biometric
    document.getElementById('useBiometricBtn').addEventListener('click', async () => {
      const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (!settings || !settings.biometricEnabled || !settings.biometricCredentialId) {
        alert('Biometric authentication is not set up.');
        return;
      }
      const tab = await getActiveTabWithContentScript();
      if (!tab) {
        alert('Please open a regular website tab and try again.');
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'BIOMETRIC_AUTH', credentialId: settings.biometricCredentialId }, (response) => {
        if (chrome.runtime.lastError) {
          alert('Could not communicate with content script. Make sure you have a tab open.');
          return;
        }
        if (response && response.success) {
          alert('Biometric authentication successful!');
        } else {
          alert('Biometric authentication failed: ' + (response && response.error ? response.error : 'Unknown error'));
        }
      });
    });
  }

  async updateSetting(key, value) {
    this.settings[key] = value;
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { [key]: value }
    });
    this.updateUI();
  }

  async updateUI() {
    if (!this.settings) return;
    // Update toggle states
    document.getElementById('enableToggle').checked = this.settings.isEnabled || false;
    document.getElementById('protectionLevel').value = this.settings.protectionLevel || 'medium';
    document.getElementById('sessionTimeout').value = this.settings.sessionTimeout || 900000;

    // Update status
    const statusIcon = document.getElementById('statusIcon');
    const statusTitle = document.getElementById('statusTitle');
    const statusDescription = document.getElementById('statusDescription');

    if (!this.settings.isEnabled) {
      statusIcon.className = 'status-icon inactive';
      statusIcon.textContent = '🔓';
      statusTitle.textContent = 'Protection Disabled';
      statusDescription.textContent = 'Your passwords are not protected';
    } else if (this.settings.isAuthenticated) {
      statusIcon.className = 'status-icon active';
      statusIcon.textContent = '✅';
      statusTitle.textContent = 'Session Active';
      statusDescription.textContent = 'You are authenticated';
    } else {
      statusIcon.className = 'status-icon inactive';
      statusIcon.textContent = '🔒';
      statusTitle.textContent = 'Session Locked';
      statusDescription.textContent = 'Authentication required';
    }

    // Update controls state
    const controls = document.querySelectorAll('select, button');
    controls.forEach(control => {
      if (control.id !== 'enableToggle') {
        control.disabled = !this.settings.isEnabled;
      }
    });

    // Optionally, show biometric status
    const biometricStatus = document.getElementById('biometricStatus');
    if (biometricStatus) {
      if (this.settings.biometricEnabled) {
        biometricStatus.textContent = 'Biometric: Enabled';
      } else {
        biometricStatus.textContent = 'Biometric: Not set up';
      }
    }
  }

  startSessionTimer() {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
    }

    this.sessionTimer = setInterval(async () => {
      await this.loadSettings();
      this.updateSessionInfo();
    }, 1000);
  }

  updateSessionInfo() {
    if (!this.settings) return;
    const sessionInfo = document.getElementById('sessionInfo');

    if (!this.settings.isAuthenticated || !this.settings.lastActivity) {
      sessionInfo.textContent = 'Session expires in: --';
      return;
    }

    const now = Date.now();
    const elapsed = now - this.settings.lastActivity;
    const remaining = this.settings.sessionTimeout - elapsed;

    if (remaining <= 0) {
      sessionInfo.textContent = 'Session expired';
      this.updateUI();
      return;
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    sessionInfo.textContent = `Session expires in: ${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  showPasswordChangeDialog() {
    // Create modal for password change
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    `;

    modal.innerHTML = `
      <div style="
        background: white;
        padding: 30px;
        border-radius: 12px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        max-width: 300px;
        width: 90%;
      ">
        <h3 style="margin: 0 0 20px 0; color: #1F2937; text-align: center;">
          ${this.settings.masterPassword ? 'Change Master Password' : 'Set Master Password'}
        </h3>
        
        ${this.settings.masterPassword ? `
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #374151;">
              Current Password
            </label>
            <input type="password" id="currentPassword" style="
              width: 100%;
              padding: 10px 12px;
              border: 2px solid #E5E7EB;
              border-radius: 8px;
              font-size: 14px;
              box-sizing: border-box;
            ">
          </div>
        ` : ''}
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #374151;">
            New Password
          </label>
          <input type="password" id="newPassword" style="
            width: 100%;
            padding: 10px 12px;
            border: 2px solid #E5E7EB;
            border-radius: 8px;
            font-size: 14px;
            box-sizing: border-box;
          ">
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #374151;">
            Confirm New Password
          </label>
          <input type="password" id="confirmPassword" style="
            width: 100%;
            padding: 10px 12px;
            border: 2px solid #E5E7EB;
            border-radius: 8px;
            font-size: 14px;
            box-sizing: border-box;
          ">
        </div>
        
        <div id="passwordError" style="
          color: #EF4444;
          font-size: 12px;
          margin-bottom: 15px;
          display: none;
        "></div>
        
        <div style="display: flex; gap: 10px;">
          <button id="cancelPassword" style="
            flex: 1;
            padding: 10px 16px;
            background: #F3F4F6;
            color: #374151;
            border: none;
            border-radius: 6px;
            cursor: pointer;
          ">Cancel</button>
          
          <button id="savePassword" style="
            flex: 1;
            padding: 10px 16px;
            background: #4caf50;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
          ">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    const currentPasswordInput = modal.querySelector('#currentPassword');
    const newPasswordInput = modal.querySelector('#newPassword');
    const confirmPasswordInput = modal.querySelector('#confirmPassword');
    const errorDiv = modal.querySelector('#passwordError');
    const saveBtn = modal.querySelector('#savePassword');
    const cancelBtn = modal.querySelector('#cancelPassword');

    // Focus first input
    const firstInput = currentPasswordInput || newPasswordInput;
    firstInput.focus();

    // Save password
    saveBtn.addEventListener('click', async () => {
      errorDiv.style.display = 'none';

      const currentPassword = currentPasswordInput?.value || '';
      const newPassword = newPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      // Validation
      if (this.settings.masterPassword && !currentPassword) {
        errorDiv.textContent = 'Please enter your current password';
        errorDiv.style.display = 'block';
        return;
      }

      if (newPassword.length < 6) {
        errorDiv.textContent = 'Password must be at least 6 characters long';
        errorDiv.style.display = 'block';
        return;
      }

      if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.style.display = 'block';
        return;
      }

      // Verify current password if changing
      if (this.settings.masterPassword) {
        const authResult = await chrome.runtime.sendMessage({
          type: 'AUTHENTICATE',
          password: currentPassword
        });

        if (!authResult.success) {
          errorDiv.textContent = 'Current password is incorrect';
          errorDiv.style.display = 'block';
          return;
        }
      }

      // Set new password
      await chrome.runtime.sendMessage({
        type: 'SET_MASTER_PASSWORD',
        password: newPassword
      });

      modal.remove();
      await this.loadSettings();
      this.updateUI();
    });

    // Cancel
    cancelBtn.addEventListener('click', () => {
      modal.remove();
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // Enter key handling
    [currentPasswordInput, newPasswordInput, confirmPasswordInput].forEach(input => {
      if (input) {
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            saveBtn.click();
          }
        });
      }
    });
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});

// Utility to get a valid tab for content script communication
async function getActiveTabWithContentScript() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) return null;
  const tab = tabs[0];
  // Avoid chrome://, about:, etc.
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return null;
  return tab;
}