# SecurePass Extension

## 📁 File Structure
```
securepass/
├── manifest.json
├── background.js
├── crypto-utils.js
├── content.js
├── popup.html
├── popup.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
## 🚀 Installation Steps

### Step 1: Load Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top-right corner
3. Click the "Load unpacked" button
4. Select your `securepass` folder
5. The extension should now appear in your extensions list

### Step 2: Pin the Extension
1. Click the puzzle piece icon in Chrome's toolbar
2. Find "Secure Pass" in the list
3. Click the pin icon to keep it visible in the toolbar

## ⚙️ Initial Setup

### First Run Configuration
1. Click the Secure Pass icon in your toolbar
2. The popup will show "Protection Disabled" initially
3. Toggle "Enable Protection" to ON
4. Choose your preferred settings:
   - **Protection Level**: 
     - Low: Only password fields
     - Medium: Password + sensitive fields (recommended)
     - High: All autofill fields
   - **Session Timeout**: How long to stay authenticated

### Setting Master Password
1. Navigate to any website with a login form
2. Try to click on a password field
3. You'll see the authentication modal
4. Since this is your first time, enter a secure master password
5. This password will be required to access saved passwords

## 🔧 How It Works

### Protection Mechanism
- **Content Script**: Monitors all password and sensitive input fields
- **Authentication Check**: Verifies user authentication before allowing autofill
- **Session Management**: Automatically locks after the specified timeout
- **Modal Interface**: Clean, secure authentication dialog

### Security Features
- ✅ Blocks autofill until authenticated
- ✅ Session timeout protection
- ✅ Configurable protection levels
- ✅ Master password encryption (basic implementation)
- ✅ Visual indicators for security status

## 🛠️ Customization Options

### Adjusting Protection Levels
- **Low**: Only `input[type="password"]` fields
- **Medium**: Password fields + autocomplete fields
- **High**: All form fields, including email/username

### Session Management
- Timeout options: 5 minutes to 1 hour
- Manual lock option available
- Automatic re-authentication required

## 🔒 Security Considerations

### Current Implementation
- **Stronger Hashing**: Use bcrypt or scrypt
- **Key Derivation**: PBKDF2 or Argon2
- **Secure Storage**: Chrome's storage.local encryption
- **Biometric Authentication**: WebAuthn integration

Remember: This is a security tool, so always test thoroughly before relying on it for sensitive accounts!

## 🚦 How to Use Secure Pass (Step by Step)

### 1. Install and Pin the Extension
- Follow the installation steps above to load Secure Pass in Chrome.
- Pin the extension to your toolbar for easy access.

### 2. Open the Popup
- Click the Secure Pass icon in your Chrome toolbar.
- The popup will open, showing the current protection status and settings.

### 3. Enable Protection
- Toggle the "Enable Protection" switch to the ON position.
- Select your desired Protection Level and Session Timeout from the dropdown menus.

### 4. Set Your Master Password
- Go to any website with a login form (e.g., gmail.com, facebook.com).
- Click on a password field. The Secure Pass authentication modal will appear.
- Since this is your first time, enter a secure master password and confirm.
- This password will be required to unlock autofill and access saved passwords.

### 5. Authenticate to Unlock Autofill
- When you click a protected field, enter your master password in the modal.
- If you have enabled TOTP (2FA), enter your 6-digit code as well.
- If you have set up biometric authentication, you can use it instead of your password.

### 6. (Optional) Set Up Biometric Authentication
- Open the popup and click "Setup Biometric".
- Follow the browser prompts to register your fingerprint or face (if supported).
- Once set up, you can use "Use Biometric" in the pop-up to unlock sessions.

### 7. Lock and Unlock Sessions
- To manually lock your session, click "Lock Session" in the pop-up.
- To unlock, click a protected field and authenticate again.
- The session will auto-lock after your chosen timeout period.

### 8. Change Master Password
- In the popup, click "Change Master Password".
- Follow the prompts to update your password securely.

### 9. Check Status and Settings
- The popup shows your current session status (active/locked), protection level, and biometric status.
- Adjust settings as needed for your security preferences.

### 10. Troubleshooting
- If you see "Could not communicate with content script", make sure you have a regular website tab open (not a Chrome or new tab page).
- If biometric is not set up, follow the setup steps above.
- For other issues, see the Troubleshooting section below.
