# TOTC Pass | Password Pass

Secure password manager for Chrome/Edge browser with local encryption and PIN code protection.

## Description

**TOTC Pass | Password Pass** is a browser extension that allows you to securely store and automatically fill passwords on websites. All passwords are encrypted locally using a PIN code and never leave your device.

## Main Features

- 🔒 **Secure Encryption** — AES-GCM 256-bit with PIN code protection
- 💾 **Automatic Saving** — passwords are automatically saved when logging into sites
- ✏️ **Autofill** — quick one-click login form filling
- 🔑 **Password Generator** — generate secure passwords with customizable parameters
- 📊 **Password Strength Checker** — real-time password strength indicator with recommendations
- 🏷️ **Categories & Tags** — organize passwords with categories and tags
- 🔍 **Password Search** — quick search by domain, login, URL, category, or tag
- 🔄 **Duplicate Detection** — find passwords used on multiple sites
- 📤 **Data Export** — export passwords in encrypted format with selective export control
- 🛡️ **Whitelist** — exclude certain sites from processing
- 🔐 **Brute-Force Protection** — lockout after 5 incorrect PIN code attempts
- 👆 **Biometric Authentication** — unlock with Windows Hello, Touch ID, or other biometric methods
- 🔢 **TOTP/2FA Support** — generate and manage two-factor authentication codes

## Installation

1. Download or clone the repository
2. Open Chrome/Edge and go to `chrome://extensions/` or `edge://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked extension"
5. Select the extension folder

## Initial Setup

1. After installation, open the extension settings
2. Set a PIN code (6-12 characters, must contain at least one digit and one letter)
3. Configure password generator settings (optional)
4. Start using the extension — passwords will be saved automatically

## Usage

### Password Generator

- **In Settings**: Configure password generator settings (length 8-128, character types, exclude similar characters)
- **In Add/Edit Modal**: Click "Generate Password" button below password field
- **On Websites**: Right-click on password field → "Generate Password" from context menu

### Password Strength Indicator

- Real-time strength indicator appears when entering/editing passwords
- Color-coded strength levels: Very Weak, Weak, Medium, Strong, Very Strong
- Recommendations for improving password strength
- Strength badge displayed in password list

### Categories & Tags

- **Categories**: Create categories (Work, Personal, Social Media, etc.) and assign to passwords
- **Tags**: Add multiple tags to passwords for better organization
- **Filtering**: Filter passwords by category or tag in the password list
- **Management**: Add new categories directly from the password list toolbar

### Duplicate Detection

- Click "Find Duplicates" button in password list
- View all passwords used on multiple sites
- Get recommendations to replace duplicate passwords with unique ones

### Saving Password

Passwords are automatically saved when logging into sites. If the PIN code is not entered, a notification will appear asking you to open the popup and enter the PIN code.

### Filling Form

- **Via Context Menu**: Right-click on the page → "Fill Login Form"
- **Via Popup**: Open the extension popup and select the desired password

### Password Management

Open extension settings to:
- View all saved passwords with strength indicators
- Search passwords by domain, username, URL, category, or tag
- Filter by category and tags
- Assign categories and tags to passwords
- Copy passwords
- Edit passwords
- Delete passwords
- Control export permissions for individual passwords
- Export passwords (only passwords with export enabled)

### Biometric Authentication

- **Setup**: Configure biometric authentication (Windows Hello, Touch ID, Face ID) in extension settings
- **Unlock**: Use biometric authentication to unlock the extension instead of entering PIN code
- **Security**: PIN code is encrypted and stored securely, accessible only via biometric verification
- **Compatibility**: Works with WebAuthn-compatible devices and browsers

### TOTP/2FA Codes

- **Add 2FA Codes**: Add TOTP secrets from authenticator apps (Google Authenticator, Authy, etc.)
- **Generate Codes**: Automatically generate 6-digit TOTP codes that update every 30 seconds
- **Manage**: View, edit, and delete 2FA codes in the extension popup
- **Copy**: One-click copy of 2FA codes for quick login
- **Secure Storage**: All TOTP secrets are encrypted with your PIN code

## Security

- All passwords are encrypted using AES-GCM 256-bit
- PIN code is stored as a SHA-256 hash
- All data is stored locally in the browser
- No data is transmitted to external servers
- Brute-force protection: lockout after 5 incorrect attempts
- Selective export control: disable export for sensitive passwords

## Technical Details

- **Manifest Version**: 3
- **Encryption Algorithm**: AES-GCM 256-bit
- **Key Derivation**: PBKDF2 with SHA-256, 100,000 iterations
- **Storage**: chrome.storage.local

## Requirements

- Chrome 88+ or Edge 88+
- Web Crypto API support

## License

The project is created based on open source.

## Repository

GitHub: https://github.com/The-Open-Tech-Company/pass-passw-browser

## Support

For detailed information about features, see [INFO.md](INFO.md)

---

**Created by TOTC based on open source. 2025**
