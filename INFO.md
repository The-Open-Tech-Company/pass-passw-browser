# TOTC Pass | Password Pass - Detailed Feature Description

## Overview

**TOTC Pass | Password Pass** is a Chrome/Edge browser extension designed for secure password storage and management. The extension uses local encryption with a PIN code and does not transmit data to external servers.

## Main Features

### 1. Secure Password Storage

- **Local Encryption**: All passwords are encrypted using the AES-GCM algorithm (256-bit)
- **PIN Code Protection**: Access to passwords is protected by a PIN code (6-12 characters, must contain at least one digit and one letter)
- **Local Storage**: All data is stored only in the user's browser, without transmission to external servers
- **Automatic Encryption**: Passwords are automatically encrypted when saved using a unique salt for each password

### 2. Automatic Password Saving

- **Automatic Login Form Detection**: The extension automatically detects login forms on websites
- **Smart Field Recognition**: Identifies username and password fields by various indicators:
  - Field type (email, text, password)
  - Name and id attributes
  - Autocomplete attributes
  - Field positions relative to each other
- **Save on Form Submit**: Passwords are automatically saved when the login form is submitted
- **Save on Button Click**: Tracks clicks on login buttons to save passwords
- **Dynamic Form Handling**: Support for forms loaded dynamically via JavaScript

### 3. Automatic Form Filling

- **One-Click Autofill**: Fill login forms via context menu or automatically
- **Account Selection**: If multiple accounts are saved for a site, a selection menu is displayed
- **PIN Code Protection**: PIN code entry is required before filling
- **On-Page Modal Window**: Convenient PIN code entry directly on the website page
- **Complex Form Support**: Works with various types of login forms, including SPA applications

### 4. Password Management

#### Extension Popup

- **Two Tabs**:
  - **Saved**: View all saved passwords
  - **Current Site**: View passwords only for the currently open site
- **Search**: Quick search for passwords by domain, username, or URL
- **Password Viewing**: Ability to show/hide passwords
- **Copying**: Copy password to clipboard with one click
- **Deletion**: Delete individual passwords
- **Export**: Export all passwords in an encrypted JSON file
- **Clear**: Delete all saved passwords

#### Extension Settings

- **PIN Code Management**:
  - Set PIN code on first use (6-12 characters, must contain at least one digit and one letter)
  - Change existing PIN code
  - Brute-force protection: lockout after 5 incorrect attempts
- **Password Generator Settings**:
  - Password length: 8-128 characters (default: 16)
  - Character types: uppercase letters, lowercase letters, numbers, special characters
  - Exclude similar characters: avoid confusing characters (0/O, 1/l/I)
  - Test generation: preview generated passwords
- **Password Strength Indicator**:
  - Real-time strength analysis when entering/editing passwords
  - Color-coded strength levels: Very Weak, Weak, Medium, Strong, Very Strong
  - Recommendations for improving password strength
  - Strength badge displayed in password list
- **Categories & Tags**:
  - Create custom categories (Work, Personal, Social Media, etc.)
  - Assign categories to passwords
  - Add multiple tags to passwords
  - Filter passwords by category or tag
  - Quick category creation from password list toolbar
- **Duplicate Detection**:
  - Find passwords used on multiple sites
  - View all sites where duplicate password is used
  - Security warnings and recommendations
- **Selective Export Control**:
  - Enable/disable export for individual passwords
  - Export only passwords with export enabled
  - Enhanced security for sensitive passwords
- **Site Whitelist**:
  - Add sites where the extension will not work
  - Support for wildcards (*.example.com)
  - List management (add/remove)
- **Reset Settings**: Complete reset of all settings and passwords

### 5. Security

#### Encryption

- **Algorithm**: AES-GCM with 256-bit key length
- **Key Derivation**: PBKDF2 with 100,000 iterations and SHA-256
- **Unique Salt**: Each password is encrypted with a unique random salt
- **IV (Initialization Vector)**: Unique IV for each encryption

#### PIN Code Protection

- **Hashing**: PIN code is stored as a SHA-256 hash
- **Brute-Force Protection**: 
  - Maximum 5 input attempts
  - Lockout for 15 minutes after exceeding the limit
  - Attempt counter resets on successful entry
- **Session PIN**: PIN code is stored in memory only during an active session
- **Automatic Timeout**: PIN code is automatically cleared from memory after 5 minutes of inactivity

#### Data Protection

- **Local Storage**: All data is stored in `chrome.storage.local`
- **No Data Transmission**: No data is transmitted to external servers
- **Whitelist**: Ability to exclude certain sites from processing

### 6. Technical Features

#### Architecture

- **Service Worker (background.js)**: Message handling, PIN session management, storage operations
- **Content Script (content.js)**: Page integration, form detection, autofill
- **Popup (popup.html/js)**: Password management interface
- **Options (options.html/js)**: Extension settings page
- **Crypto Utils (crypto-utils.js)**: Encryption functions and PIN code operations

#### Form Handling

- **MutationObserver**: Tracking dynamically added forms on the page
- **Event Handlers**: Tracking submit, click, input, change events
- **Password Caching**: Temporary caching of entered passwords for saving on button clicks
- **Smart Detection**: Multiple strategies for form field detection

#### Pending Passwords

- **Pending Passwords Mechanism**: If PIN code is not entered, passwords are temporarily saved
- **Automatic Saving**: When PIN code is entered, all pending passwords are automatically saved
- **Notifications**: Informing the user about the need to enter PIN code

### 7. User Interface

#### Design

- **Modern UI**: Clean and minimalist design
- **Responsiveness**: Interface adapted for various window sizes
- **Animations**: Smooth transitions and animations to improve UX
- **Icons**: Visual indicators for various actions

#### Modal Windows

- **PIN Modal in Popup**: For password access
- **PIN Modal on Page**: For form autofill
- **Account Selection Menu**: When multiple saved accounts are available

#### Notifications

- **Chrome Notifications API**: Notifications about password saving, errors, need for PIN code entry
- **Visual Feedback**: Messages about successful operations and errors

### 8. Context Menu

- **Browser Integration**: Adding "Fill Login Form" and "Generate Password" items to the context menu
- **Smart Processing**: Automatic detection and filling of forms on the page
- **Password Generation**: Generate passwords directly in password fields via context menu

### 9. Biometric Authentication (WebAuthn)

- **Platform Support**: Works with Windows Hello, Touch ID, Face ID, and other WebAuthn-compatible authenticators
- **Setup Process**: 
  - Enable biometric authentication in extension settings
  - Register biometric credentials using device authenticator
  - PIN code is encrypted and stored securely for biometric unlock
- **Unlock Methods**:
  - Unlock extension popup using biometric authentication
  - Automatic biometric prompt when available
  - Fallback to PIN code if biometric fails or is unavailable
- **Security**:
  - PIN code encrypted with biometric key
  - Biometric credentials stored locally
  - No biometric data transmitted to external servers
- **Compatibility**: Requires WebAuthn support in browser (Chrome 67+, Edge 18+)

### 10. TOTP/2FA Code Management

- **TOTP Support**: Full support for Time-based One-Time Password (RFC 6238)
- **Adding 2FA Codes**:
  - Add TOTP secrets from authenticator apps
  - Support for Base32 and Hex format secrets
  - Service name and login association
- **Code Generation**:
  - Automatic 6-digit code generation
  - 30-second time step (standard TOTP)
  - Real-time code updates
  - Visual countdown timer
- **Management Features**:
  - View all saved 2FA codes in extension popup
  - Edit service name, login, and secret
  - Delete 2FA codes
  - One-click copy to clipboard
- **Security**:
  - All TOTP secrets encrypted with PIN code
  - Secrets never stored in plain text
  - Secure key derivation for encryption
- **Integration**: Dedicated TOTP tab in extension popup for easy access

### 11. Export and Import

- **Password Export**: 
  - Format: encrypted JSON
  - Protection: encryption using PIN code
  - Metadata: version, export date, encryption information
  - Selective export: only passwords with export enabled are exported
- **Export Control**: 
  - Individual password export toggle in password list
  - Enhanced security for sensitive passwords
  - Default: export enabled for all passwords
- **Export Security**: Exported data can only be decrypted with the correct PIN code

### 12. Error Handling

- **Validation**: Checking correctness of PIN code input, domains, data
- **Encryption Error Handling**: Proper handling of errors during encryption/decryption
- **Format Compatibility**: Support for old encrypted data formats
- **Logging**: Detailed error logging for debugging

### 13. Performance

- **Lazy Loading**: Passwords are loaded only when needed
- **Caching**: Data caching to reduce storage access
- **DOM Optimization**: Efficient DOM work through MutationObserver
- **Minimal Impact**: Extension does not slow down browser performance

### 14. Compatibility

- **Chrome**: Full Chrome support (Manifest V3)
- **Edge**: Microsoft Edge compatibility
- **All Sites**: Works on all websites (except browser system pages)
- **SPA Applications**: Support for single-page applications with dynamic content

## Security and Privacy

### Security Principles

1. **Local Storage**: All data remains on the user's device
2. **Strong Encryption**: Use of modern cryptographic algorithms
3. **PIN Code Protection**: Multiple levels of protection against unauthorized access
4. **Minimal Permissions**: Extension requests only necessary permissions
5. **Open Source**: Ability for community code audit

### Usage Recommendations

- Use a unique PIN code that is not used elsewhere
- Regularly export passwords for backup
- Do not share your PIN code
- Use whitelist to exclude sites where extension work is not needed
- Regularly check saved passwords and delete unused ones

## Technical Details

### Encryption Algorithms

- **Symmetric Encryption**: AES-GCM 256-bit
- **Key Derivation**: PBKDF2 with SHA-256, 100,000 iterations
- **Salt Length**: 16 bytes (128 bits)
- **IV Length**: 12 bytes (96 bits)

### Data Storage

- **Format**: JSON in chrome.storage.local
- **Structure**: 
  - `passwords`: object with domains and password arrays (includes category, tags, allowExport)
  - `pinHash`: SHA-256 hash of PIN code
  - `whitelist`: array of domains in whitelist
  - `pendingPasswords`: temporary passwords awaiting PIN code
  - `pinAttempts`: PIN code input attempt counter
  - `pinLockedUntil`: time until PIN code unlock
  - `passwordGeneratorSettings`: password generator configuration
  - `passwordCategories`: array of custom categories
  - `passwordTags`: array of all tags used
  - `biometricCredentialId`: WebAuthn credential ID for biometric authentication
  - `biometricCredentialData`: encrypted biometric credential data
  - `biometricEnabled`: boolean flag for biometric authentication
  - `biometricEncryptedPin`: PIN code encrypted with biometric key
  - `biometricPinKey`: encryption key for biometric PIN
  - `totpList`: array of encrypted TOTP secrets

### Extension API

- **Chrome Storage API**: For data storage
- **Chrome Runtime API**: For message exchange between components
- **Chrome Tabs API**: For getting information about the current tab
- **Chrome Notifications API**: For user notifications
- **Chrome Context Menus API**: For context menu
- **Web Crypto API**: For cryptographic operations
- **WebAuthn API**: For biometric authentication

## Development and Support

### Version

- **Current Version**: 2.3.0
- **Manifest Version**: 3
- **Release Date**: 2025

### Changelog

For a complete list of changes, see [CHANGELOG.md](../CHANGELOG.md).

### License

This project is released into the public domain. See [LICENSE](../LICENSE) for details.

### Repository

GitHub: https://github.com/The-Open-Tech-Company/pass-passw-browser

### Contributing

We welcome contributions! Please see the main [README.md](../README.md) for contribution guidelines.

### Security

If you discover a security vulnerability, please do not create a public issue. Instead, please contact the maintainers directly.

---

**Created by TOTC based on open source. 2025**
