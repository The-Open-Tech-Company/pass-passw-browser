let currentWhitelist = [];
let selectedImportFile = null;
let allSavedPasswords = [];
let editingPassword = null;
const passwordStore = new Map();
let categories = [];
let tags = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadPasswordGeneratorSettings();
  await loadCategoriesAndTags();
  await loadDataCategoriesAndTags();
  await loadBiometricSettings();
  setupEventListeners();
  setupNavigation();
  loadExtensionVersion();
});

async function loadSettings() {
  const result = await chrome.storage.local.get(['pinHash', 'whitelist']);
  
  if (result.pinHash) {
    document.getElementById('pin-setup').style.display = 'none';
    document.getElementById('pin-change').style.display = 'block';
  } else {
    document.getElementById('pin-setup').style.display = 'block';
    document.getElementById('pin-change').style.display = 'none';
  }
  
  currentWhitelist = result.whitelist || [];
  renderWhitelist();
}

async function loadBiometricSettings() {
  try {
    const isEnabled = await isBiometricEnabled();
    const isRegistered = await isBiometricRegistered();
    const isSupported = isWebAuthnSupported();
    
    const checkbox = document.getElementById('biometric-enabled');
    const statusBox = document.getElementById('biometric-status');
    const statusText = document.getElementById('biometric-status-text');
    const setupButtons = document.getElementById('biometric-setup-buttons');
    const setupBtn = document.getElementById('setup-biometric-btn');
    const removeBtn = document.getElementById('remove-biometric-btn');
    
    if (!isSupported) {
      checkbox.disabled = true;
      statusBox.style.display = 'block';
      statusBox.className = 'info-box';
      statusText.textContent = 'WebAuthn не поддерживается в вашем браузере. Обновите браузер до последней версии.';
      setupButtons.style.display = 'none';
      return;
    }
    
    checkbox.checked = isEnabled;
    
    if (isRegistered) {
      statusBox.style.display = 'block';
      statusBox.className = 'info-box';
      statusText.textContent = 'Биометрическая аутентификация настроена и готова к использованию.';
      setupBtn.style.display = 'none';
      removeBtn.style.display = 'inline-block';
    } else {
      statusBox.style.display = 'block';
      statusBox.className = 'info-box';
      statusText.textContent = 'Биометрическая аутентификация не настроена. Нажмите "Настроить биометрию" для регистрации.';
      setupBtn.style.display = 'inline-block';
      removeBtn.style.display = 'none';
    }
    
    setupButtons.style.display = 'block';
  } catch (error) {
    console.error('Ошибка при загрузке настроек биометрии:', error);
  }
}

async function loadPasswordGeneratorSettings() {
  const settings = await getPasswordGeneratorSettings();
  document.getElementById('password-length').value = settings.length;
  document.getElementById('password-length-value').textContent = settings.length;
  document.getElementById('include-uppercase').checked = settings.includeUppercase;
  document.getElementById('include-lowercase').checked = settings.includeLowercase;
  document.getElementById('include-numbers').checked = settings.includeNumbers;
  document.getElementById('include-special').checked = settings.includeSpecial;
  document.getElementById('exclude-similar').checked = settings.excludeSimilar;
}

async function loadCategoriesAndTags() {
  try {
    const result = await chrome.storage.local.get(['passwordCategories', 'passwordTags']);
    categories = result.passwordCategories || [];
    tags = result.passwordTags || [];
    updateCategoryAndTagFilters();
  } catch (error) {
    console.error('Ошибка при загрузке категорий и тегов:', error);
    categories = [];
    tags = [];
  }
}

function updateCategoryAndTagFilters() {
  const categoryFilter = document.getElementById('category-filter');
  const tagFilter = document.getElementById('tag-filter');
  
  // Обновляем категории
  categoryFilter.innerHTML = '<option value="">Все категории</option>';
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categoryFilter.appendChild(option);
  });
  
  tagFilter.innerHTML = '<option value="">Все теги</option>';
  tags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    tagFilter.appendChild(option);
  });
}

function setupEventListeners() {
  document.getElementById('save-pin-btn').addEventListener('click', savePin);
  document.getElementById('change-pin-btn').addEventListener('click', changePin);
  document.getElementById('add-site-btn').addEventListener('click', addSite);
  document.getElementById('site-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addSite();
    }
  });
  document.getElementById('reset-btn').addEventListener('click', resetSettings);
  
  // Экспорт и импорт
  document.getElementById('export-btn').addEventListener('click', exportPasswords);
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', handleFileSelect);
  document.getElementById('import-confirm-btn').addEventListener('click', importPasswords);
  
  document.getElementById('verify-pin-for-passwords-btn').addEventListener('click', verifyPinForPasswords);
  document.getElementById('refresh-passwords-btn').addEventListener('click', loadSavedPasswords);
  document.getElementById('add-password-btn').addEventListener('click', openAddPasswordModal);
  document.getElementById('passwords-search').addEventListener('input', filterPasswords);
  document.getElementById('category-filter').addEventListener('change', filterPasswords);
  document.getElementById('tag-filter').addEventListener('change', filterPasswords);
  document.getElementById('find-duplicates-btn').addEventListener('click', showDuplicatePasswords);
  document.getElementById('add-category-btn').addEventListener('click', addNewCategory);
  document.getElementById('new-category-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addNewCategory();
    }
  });
  
  document.getElementById('close-add-modal').addEventListener('click', closeAddPasswordModal);
  document.getElementById('cancel-add-password-btn').addEventListener('click', closeAddPasswordModal);
  document.getElementById('save-add-password-btn').addEventListener('click', saveNewPassword);
  document.getElementById('toggle-add-password').addEventListener('click', toggleAddPasswordVisibility);
  
  document.getElementById('close-edit-modal').addEventListener('click', closeEditModal);
  document.getElementById('cancel-edit-password-btn').addEventListener('click', closeEditModal);
  document.getElementById('save-edit-password-btn').addEventListener('click', saveEditedPassword);
  document.getElementById('toggle-edit-password').addEventListener('click', toggleEditPasswordVisibility);
  document.getElementById('edit-pin').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveEditedPassword();
    }
  });
  document.getElementById('passwords-view-pin').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      verifyPinForPasswords();
    }
  });
  
  const pinInputs = document.querySelectorAll('.pin-input');
  pinInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9a-zA-Z]/g, '');
    });
  });
  
  document.getElementById('add-password-modal').addEventListener('click', (e) => {
    if (e.target.id === 'add-password-modal') {
      closeAddPasswordModal();
    }
  });
  
  document.getElementById('edit-password-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-password-modal') {
      closeEditModal();
    }
  });
  
  const addPinInput = document.getElementById('add-pin');
  if (addPinInput) {
    addPinInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveNewPassword();
      }
    });
  }
  
  document.getElementById('password-length').addEventListener('input', (e) => {
    document.getElementById('password-length-value').textContent = e.target.value;
    savePasswordGeneratorSettingsFromUI();
  });
  
  document.getElementById('include-uppercase').addEventListener('change', savePasswordGeneratorSettingsFromUI);
  document.getElementById('include-lowercase').addEventListener('change', savePasswordGeneratorSettingsFromUI);
  document.getElementById('include-numbers').addEventListener('change', savePasswordGeneratorSettingsFromUI);
  document.getElementById('include-special').addEventListener('change', savePasswordGeneratorSettingsFromUI);
  document.getElementById('exclude-similar').addEventListener('change', savePasswordGeneratorSettingsFromUI);
  
  document.getElementById('test-generate-password').addEventListener('click', async () => {
    const password = await generatePassword();
    const resultDiv = document.getElementById('test-password-result');
    resultDiv.textContent = password;
    resultDiv.style.display = 'block';
    resultDiv.className = 'test-password-result';
  });
  
  document.getElementById('verify-pin-for-data-btn').addEventListener('click', verifyPinForData);
  document.getElementById('data-view-pin').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      verifyPinForData();
    }
  });
  document.getElementById('add-data-btn').addEventListener('click', openAddDataModal);
  document.getElementById('refresh-data-btn').addEventListener('click', loadDataCards);
  document.getElementById('data-search').addEventListener('input', filterDataCards);
  document.getElementById('data-category-filter').addEventListener('change', filterDataCards);
  document.getElementById('data-tag-filter').addEventListener('change', filterDataCards);
  document.getElementById('add-data-category-btn').addEventListener('click', addNewDataCategory);
  document.getElementById('new-data-category-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addNewDataCategory();
    }
  });
  
  // Модальное окно данных
  document.getElementById('close-edit-data-modal').addEventListener('click', closeEditDataModal);
  document.getElementById('cancel-edit-data-btn').addEventListener('click', closeEditDataModal);
  document.getElementById('save-data-btn').addEventListener('click', saveDataCard);
  document.getElementById('delete-data-btn').addEventListener('click', deleteDataCard);
  document.getElementById('edit-data-pin').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveDataCard();
    }
  });
  
  document.getElementById('edit-data-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-data-modal') {
      closeEditDataModal();
    }
  });
  
  // TOTP обработчики
  document.getElementById('verify-pin-for-totp-btn').addEventListener('click', verifyPinForTotp);
  document.getElementById('totp-view-pin').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      verifyPinForTotp();
    }
  });
  document.getElementById('add-totp-settings-btn').addEventListener('click', openAddTotpSettingsModal);
  document.getElementById('refresh-totp-btn').addEventListener('click', loadTotpSettings);
  document.getElementById('close-totp-settings-modal').addEventListener('click', closeTotpSettingsModal);
  document.getElementById('cancel-totp-settings-btn').addEventListener('click', closeTotpSettingsModal);
  document.getElementById('save-totp-settings-btn').addEventListener('click', saveTotpSettings);
  document.getElementById('delete-totp-settings-btn').addEventListener('click', deleteTotpSettings);
  
  document.getElementById('totp-settings-modal').addEventListener('click', (e) => {
    if (e.target.id === 'totp-settings-modal') {
      closeTotpSettingsModal();
    }
  });
  
  document.getElementById('generate-add-password').addEventListener('click', async () => {
    const password = await generatePassword();
    document.getElementById('add-password').value = password;
    document.getElementById('add-password').type = 'text';
    updatePasswordStrength('add-password', 'add-password-strength');
  });
  
  document.getElementById('generate-edit-password').addEventListener('click', async () => {
    const password = await generatePassword();
    document.getElementById('edit-password').value = password;
    document.getElementById('edit-password').type = 'text';
    updatePasswordStrength('edit-password', 'edit-password-strength');
  });
  
  // Проверка силы пароля при вводе
  document.getElementById('add-password').addEventListener('input', () => {
    updatePasswordStrength('add-password', 'add-password-strength');
  });
  
  document.getElementById('edit-password').addEventListener('input', () => {
    updatePasswordStrength('edit-password', 'edit-password-strength');
  });
  
  // Обработчики биометрии
  document.getElementById('biometric-enabled').addEventListener('change', handleBiometricToggle);
  document.getElementById('setup-biometric-btn').addEventListener('click', setupBiometric);
  document.getElementById('remove-biometric-btn').addEventListener('click', removeBiometric);
  
  // Обработчики модального окна PIN для биометрии
  document.getElementById('close-biometric-pin-modal').addEventListener('click', closeBiometricPinModal);
  document.getElementById('cancel-biometric-pin-btn').addEventListener('click', closeBiometricPinModal);
  document.getElementById('save-biometric-pin-btn').addEventListener('click', saveBiometricPin);
  document.getElementById('biometric-pin-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBiometricPin();
    }
  });
  
  document.getElementById('biometric-pin-modal').addEventListener('click', (e) => {
    if (e.target.id === 'biometric-pin-modal') {
      closeBiometricPinModal();
    }
  });
}

async function savePasswordGeneratorSettingsFromUI() {
  const settings = {
    length: parseInt(document.getElementById('password-length').value),
    includeUppercase: document.getElementById('include-uppercase').checked,
    includeLowercase: document.getElementById('include-lowercase').checked,
    includeNumbers: document.getElementById('include-numbers').checked,
    includeSpecial: document.getElementById('include-special').checked,
    excludeSimilar: document.getElementById('exclude-similar').checked
  };
  await savePasswordGeneratorSettings(settings);
}

function updatePasswordStrength(inputId, indicatorId) {
  const password = document.getElementById(inputId).value;
  const indicator = document.getElementById(indicatorId);
  const fill = document.getElementById(indicatorId.replace('-strength', '-strength-fill'));
  const text = document.getElementById(indicatorId.replace('-strength', '-strength-text'));
  const suggestions = document.getElementById(indicatorId.replace('-strength', '-strength-suggestions'));
  
  if (!password || password.length === 0) {
    indicator.style.display = 'none';
    return;
  }
  
  indicator.style.display = 'block';
  const strength = checkPasswordStrength(password);
  
  fill.style.width = `${(strength.score / 10) * 100}%`;
  fill.style.backgroundColor = strength.color;
  text.textContent = strength.label;
  text.style.color = strength.color;
  
  if (strength.suggestions.length > 0) {
    suggestions.innerHTML = '<strong>Рекомендации:</strong><ul>' + 
      strength.suggestions.map(s => `<li>${s}</li>`).join('') + 
      '</ul>';
    suggestions.style.display = 'block';
  } else {
    suggestions.style.display = 'none';
  }
}

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.content-section');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetSection = item.getAttribute('data-section');

      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      sections.forEach(section => section.classList.remove('active'));
      const targetSectionElement = document.getElementById(`${targetSection}-section`);
      if (targetSectionElement) {
        targetSectionElement.classList.add('active');
        
        if (targetSection === 'saved-passwords') {
          checkPinForPasswords();
        }
        
        if (targetSection === 'data') {
          checkPinForData();
        }
        
        if (targetSection === 'totp') {
          checkPinForTotp();
        }
      }
    });
  });
}

function loadExtensionVersion() {
  const manifest = chrome.runtime.getManifest();
  const versionElement = document.getElementById('extension-version');
  if (versionElement) {
    versionElement.textContent = manifest.version;
  }
}

async function savePin() {
  const pin = document.getElementById('pin-input').value;
  const pinConfirm = document.getElementById('pin-confirm').value;
  const errorDiv = document.getElementById('pin-error');
  
  if (!pin || pin.length < 6 || pin.length > 12) {
    errorDiv.textContent = 'PIN-код должен содержать от 6 до 12 символов (цифры и буквы)';
    errorDiv.style.display = 'block';
    return;
  }
  
  const hasDigit = /[0-9]/.test(pin);
  const hasLetter = /[a-zA-Z]/.test(pin);
  if (!hasDigit || !hasLetter) {
    errorDiv.textContent = 'PIN-код должен содержать хотя бы одну цифру и одну букву';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (pin !== pinConfirm) {
    errorDiv.textContent = 'PIN-коды не совпадают';
    errorDiv.style.display = 'block';
    return;
  }
  
  try {
    await savePinHash(pin);
    
    errorDiv.style.display = 'none';
    
    const successMsg = document.createElement('div');
    successMsg.className = 'success-message show';
    successMsg.textContent = 'PIN-код успешно установлен!';
    document.getElementById('pin-setup').insertBefore(successMsg, document.getElementById('pin-setup').firstChild);
    
    setTimeout(async () => {
      await loadSettings();
      document.getElementById('pin-input').value = '';
      document.getElementById('pin-confirm').value = '';
    }, 2000);
  } catch (error) {
    errorDiv.textContent = 'Ошибка при сохранении PIN-кода: ' + error.message;
    errorDiv.style.display = 'block';
  }
}

async function changePin() {
  const currentPin = document.getElementById('current-pin').value;
  const newPin = document.getElementById('new-pin-input').value;
  const newPinConfirm = document.getElementById('new-pin-confirm').value;
  const errorDiv = document.getElementById('pin-change-error');
  
  try {
    const isValid = await verifyPin(currentPin);
    if (!isValid) {
      const result = await chrome.storage.local.get(['pinAttempts']);
      const attempts = result.pinAttempts || 0;
      const remaining = 5 - attempts;
      
      if (remaining > 0) {
        errorDiv.textContent = `Неверный текущий PIN-код. Осталось попыток: ${remaining}`;
      } else {
        errorDiv.textContent = 'Превышено количество попыток. PIN-код заблокирован на 15 минут.';
      }
      errorDiv.style.display = 'block';
      return;
    }
  } catch (error) {
    errorDiv.textContent = error.message || 'Ошибка при проверке PIN-кода';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (!newPin || newPin.length < 6 || newPin.length > 12) {
    errorDiv.textContent = 'PIN-код должен содержать от 6 до 12 символов (цифры и буквы)';
    errorDiv.style.display = 'block';
    return;
  }
  
  // Проверка сложности PIN: должен содержать хотя бы одну цифру и одну букву
  const hasDigit = /[0-9]/.test(newPin);
  const hasLetter = /[a-zA-Z]/.test(newPin);
  if (!hasDigit || !hasLetter) {
    errorDiv.textContent = 'PIN-код должен содержать хотя бы одну цифру и одну букву';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (newPin !== newPinConfirm) {
    errorDiv.textContent = 'Новые PIN-коды не совпадают';
    errorDiv.style.display = 'block';
    return;
  }
  
  try {
    await savePinHash(newPin);
    
    errorDiv.style.display = 'none';
    
    const successMsg = document.createElement('div');
    successMsg.className = 'success-message show';
    successMsg.textContent = 'PIN-код успешно изменён!';
    document.getElementById('pin-change').insertBefore(successMsg, document.getElementById('pin-change').firstChild);
    
    setTimeout(() => {
      document.getElementById('current-pin').value = '';
      document.getElementById('new-pin-input').value = '';
      document.getElementById('new-pin-confirm').value = '';
      successMsg.remove();
    }, 2000);
  } catch (error) {
    errorDiv.textContent = 'Ошибка при изменении PIN-кода: ' + error.message;
    errorDiv.style.display = 'block';
  }
}

function addSite() {
  const siteInput = document.getElementById('site-input');
  let site = siteInput.value.trim();
  
  if (!site) {
    return;
  }
  
  site = site.toLowerCase();
  
  const hasMixedScript = /[^\x00-\x7F]/.test(site);
  if (hasMixedScript) {
    try {
      const normalized = site.normalize('NFKC');
      if (normalized !== site) {
        alert('Домен содержит недопустимые символы. Используйте только латинские буквы, цифры, дефисы и точки.');
        return;
      }
    } catch (e) {
      alert('Домен содержит недопустимые символы.');
      return;
    }
  }
  
  const domainPattern = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  
  const isAscii = /^[\x00-\x7F]*$/.test(site);
  if (!isAscii) {
    alert('Домен должен содержать только ASCII символы (латинские буквы, цифры, дефисы и точки).');
    return;
  }
  
  if (!domainPattern.test(site)) {
    alert('Неверный формат домена. Используйте формат: example.com или *.example.com');
    return;
  }
  
  if (site.includes('..') || site.startsWith('.') || site.endsWith('.')) {
    alert('Домен не может содержать двойные точки или начинаться/заканчиваться точкой.');
    return;
  }
  
  if (site.length > 253) {
    alert('Домен слишком длинный (максимум 253 символа).');
    return;
  }
  
  if (currentWhitelist.includes(site)) {
    alert('Этот сайт уже в белом списке');
    return;
  }
  
  currentWhitelist.push(site);
  chrome.storage.local.set({ whitelist: currentWhitelist });
  
  siteInput.value = '';
  renderWhitelist();
}

function removeSite(site) {
  currentWhitelist = currentWhitelist.filter(s => s !== site);
  chrome.storage.local.set({ whitelist: currentWhitelist });
  renderWhitelist();
}

// Безопасная функция для экранирования HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderWhitelist() {
  const listDiv = document.getElementById('whitelist-list');
  listDiv.textContent = '';
  
  if (currentWhitelist.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'Нет сайтов в белом списке';
    listDiv.appendChild(emptyState);
    return;
  }
  
  currentWhitelist.forEach(site => {
    const whitelistItem = document.createElement('div');
    whitelistItem.className = 'whitelist-item';
    
    const siteName = document.createElement('span');
    siteName.className = 'site-name';
    siteName.textContent = site;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'Удалить';
    removeBtn.setAttribute('data-site', escapeHtml(site));
    
    removeBtn.addEventListener('click', () => {
      if (confirm('Удалить этот сайт из белого списка?')) {
        removeSite(removeBtn.getAttribute('data-site'));
      }
    });
    
    whitelistItem.appendChild(siteName);
    whitelistItem.appendChild(removeBtn);
    listDiv.appendChild(whitelistItem);
  });
}

function openAddPasswordModal() {
  document.getElementById('add-url').value = '';
  document.getElementById('add-username').value = '';
  document.getElementById('add-password').value = '';
  document.getElementById('add-pin').value = '';
  document.getElementById('add-password').type = 'password';
  
  document.getElementById('add-password-error').style.display = 'none';
  document.getElementById('add-password-success').style.display = 'none';
  
  document.getElementById('add-password-modal').style.display = 'flex';
}

function closeAddPasswordModal() {
  document.getElementById('add-password-modal').style.display = 'none';
  const passwordField = document.getElementById('add-password');
  if (passwordField) {
    passwordField.value = '';
    passwordField.type = 'password';
  }
  document.getElementById('add-url').value = '';
  document.getElementById('add-username').value = '';
  document.getElementById('add-pin').value = '';
}

function toggleAddPasswordVisibility() {
  const passwordInput = document.getElementById('add-password');
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
  } else {
    passwordInput.type = 'password';
  }
}

async function saveNewPassword() {
  const url = document.getElementById('add-url').value.trim();
  const username = document.getElementById('add-username').value.trim();
  const password = document.getElementById('add-password').value;
  const pin = document.getElementById('add-pin').value;
  const errorDiv = document.getElementById('add-password-error');
  const successDiv = document.getElementById('add-password-success');
  
  // Скрываем предыдущие сообщения
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  
  if (!url) {
    errorDiv.textContent = 'Введите URL страницы входа';
    errorDiv.style.display = 'block';
    return;
  }
  
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    // Если URL не начинается с протокола, пробуем добавить https://
    try {
      parsedUrl = new URL(url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`);
    } catch (e) {
      errorDiv.textContent = 'Неверный формат URL. Используйте полную ссылку (например: https://example.com/login)';
      errorDiv.style.display = 'block';
      return;
    }
  }
  
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    errorDiv.textContent = 'Поддерживаются только HTTP и HTTPS протоколы';
    errorDiv.style.display = 'block';
    return;
  }
  
  const normalizedDomain = parsedUrl.hostname.toLowerCase();
  
  const domainPattern = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  if (!domainPattern.test(normalizedDomain)) {
    errorDiv.textContent = 'Неверный формат домена в URL';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (!username) {
    errorDiv.textContent = 'Введите логин';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (!password) {
    errorDiv.textContent = 'Введите пароль';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (!pin) {
    errorDiv.textContent = 'Введите PIN-код для подтверждения';
    errorDiv.style.display = 'block';
    return;
  }
  
  try {
    const verifyResult = await chrome.runtime.sendMessage({
      action: 'verifyAndSetPin',
      pin: pin
    });
    
    if (!verifyResult.success) {
      errorDiv.textContent = verifyResult.error || 'Неверный PIN-код';
      errorDiv.style.display = 'block';
      return;
    }
  } catch (error) {
    errorDiv.textContent = 'Ошибка при проверке PIN-кода: ' + error.message;
    errorDiv.style.display = 'block';
    return;
  }
  
  const finalUrl = parsedUrl.href;
  
  try {
    const saveResult = await chrome.runtime.sendMessage({
      action: 'savePassword',
      domain: normalizedDomain,
      url: finalUrl,
      username: username,
      password: password
    });
    
    if (saveResult.success) {
      successDiv.textContent = 'Пароль успешно сохранён!';
      successDiv.style.display = 'block';
      
      setTimeout(async () => {
        closeAddPasswordModal();
        await loadSavedPasswords();
      }, 1500);
    } else {
      errorDiv.textContent = saveResult.error || 'Ошибка при сохранении пароля';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Ошибка при сохранении пароля: ' + error.message;
    errorDiv.style.display = 'block';
  }
}

async function resetSettings() {
  if (!confirm('Вы уверены, что хотите сбросить все настройки? Это действие нельзя отменить!')) {
    return;
  }
  
  if (!confirm('ВНИМАНИЕ: Это также удалит все сохранённые пароли! Продолжить?')) {
    return;
  }
  
  await chrome.storage.local.clear();
  currentWhitelist = [];
  await loadSettings();
  alert('Все настройки сброшены');
}

async function exportPasswords() {
  const pin = document.getElementById('export-pin').value;
  const errorDiv = document.getElementById('export-import-error');
  const successDiv = document.getElementById('export-import-success');
  
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  
  if (!pin) {
    errorDiv.textContent = 'Введите PIN-код для экспорта';
    errorDiv.style.display = 'block';
    return;
  }
  
  try {
    const isValid = await verifyPin(pin);
    if (!isValid) {
      errorDiv.textContent = 'Неверный PIN-код';
      errorDiv.style.display = 'block';
      return;
    }
    
    const response = await chrome.runtime.sendMessage({ action: 'getAllPasswords' });
    if (!response || !response.passwords || response.passwords.length === 0) {
      errorDiv.textContent = 'Нет паролей для экспорта';
      errorDiv.style.display = 'block';
      return;
    }
    
    // Фильтруем пароли, для которых отключён экспорт
    const passwordsToExport = response.passwords.filter(pwd => pwd.allowExport !== false);
    
    if (passwordsToExport.length === 0) {
      errorDiv.textContent = 'Нет паролей, разрешённых для экспорта';
      errorDiv.style.display = 'block';
      return;
    }
    
    const exportFormat = {};
    passwordsToExport.forEach(pwd => {
      if (!exportFormat[pwd.domain]) {
        exportFormat[pwd.domain] = [];
      }
      exportFormat[pwd.domain].push({
        username: pwd.username,
        password: pwd.password,
        url: pwd.url,
        category: pwd.category || null,
        tags: pwd.tags || [],
        createdAt: pwd.createdAt,
        updatedAt: pwd.updatedAt
      });
    });
    
    const allPasswords = Object.values(exportFormat);
    const encryptedData = await encryptExportData(allPasswords, pin);
    
    const exportData = {
      version: '1.0',
      encrypted: true,
      exportDate: new Date().toISOString(),
      data: encryptedData
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `passwords-export-encrypted-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    
    successDiv.textContent = 'Пароли успешно экспортированы!';
    successDiv.style.display = 'block';
    document.getElementById('export-pin').value = '';
    
    setTimeout(() => {
      successDiv.style.display = 'none';
    }, 3000);
  } catch (error) {
    console.error('Ошибка при экспорте паролей:', error);
    errorDiv.textContent = 'Ошибка при экспорте паролей: ' + error.message;
    errorDiv.style.display = 'block';
  }
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    selectedImportFile = file;
    document.getElementById('import-file-name').textContent = file.name;
    document.getElementById('import-confirm-btn').style.display = 'block';
  }
}

async function importPasswords() {
  const pin = document.getElementById('import-pin').value;
  const errorDiv = document.getElementById('export-import-error');
  const successDiv = document.getElementById('export-import-success');
  
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  
  if (!pin) {
    errorDiv.textContent = 'Введите PIN-код для импорта';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (!selectedImportFile) {
    errorDiv.textContent = 'Выберите файл для импорта';
    errorDiv.style.display = 'block';
    return;
  }
  
  try {
    const fileContent = await readFileAsText(selectedImportFile);
    const importData = JSON.parse(fileContent);
    
    if (!importData.encrypted || !importData.data) {
      errorDiv.textContent = 'Неверный формат файла импорта';
      errorDiv.style.display = 'block';
      return;
    }
    
    if (importData.version && importData.version !== '1.0') {
      errorDiv.textContent = 'Неподдерживаемая версия формата экспорта';
      errorDiv.style.display = 'block';
      return;
    }
    
    const decryptedPasswords = await decryptExportData(importData.data, pin);
    
    if (!Array.isArray(decryptedPasswords)) {
      errorDiv.textContent = 'Неверный формат данных в файле';
      errorDiv.style.display = 'block';
      return;
    }
    
    // Валидация и нормализация импортированных данных
    const validatedPasswords = [];
    for (const passwordData of decryptedPasswords) {
      // Проверка обязательных полей
      if (!passwordData.domain || !passwordData.username || !passwordData.password) {
        console.warn('Пропущен пароль с неполными данными:', passwordData);
        continue;
      }
      
      const normalizedDomain = passwordData.domain.toLowerCase().trim();
      const domainPattern = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
      
      const isAscii = /^[\x00-\x7F]*$/.test(normalizedDomain);
      if (!isAscii || !domainPattern.test(normalizedDomain)) {
        console.warn('Пропущен пароль с невалидным доменом:', normalizedDomain);
        continue;
      }
      
      // Проверка на подозрительные паттерны
      if (normalizedDomain.includes('..') || normalizedDomain.startsWith('.') || normalizedDomain.endsWith('.')) {
        console.warn('Пропущен пароль с подозрительным доменом:', normalizedDomain);
        continue;
      }
      
      let validUrl = passwordData.url || '';
      if (validUrl) {
        try {
          const urlObj = new URL(validUrl.startsWith('http://') || validUrl.startsWith('https://') ? validUrl : `https://${validUrl}`);
          if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
            validUrl = `https://${normalizedDomain}`;
          } else {
            validUrl = urlObj.href;
          }
        } catch (e) {
          validUrl = `https://${normalizedDomain}`;
        }
      } else {
        validUrl = `https://${normalizedDomain}`;
      }
      
      validatedPasswords.push({
        domain: normalizedDomain,
        username: passwordData.username.trim(),
        password: passwordData.password,
        url: validUrl,
        createdAt: passwordData.createdAt || Date.now(),
        updatedAt: Date.now()
      });
    }
    
    if (validatedPasswords.length === 0) {
      errorDiv.textContent = 'Не найдено валидных паролей для импорта';
      errorDiv.style.display = 'block';
      return;
    }
    
    // Устанавливаем PIN в сессию для шифрования
    await chrome.runtime.sendMessage({
      action: 'verifyAndSetPin',
      pin: pin
    });
    
    let importedCount = 0;
    let failedCount = 0;
    
    for (const passwordData of validatedPasswords) {
      try {
        const saveResult = await chrome.runtime.sendMessage({
          action: 'savePassword',
          domain: passwordData.domain,
          url: passwordData.url,
          username: passwordData.username,
          password: passwordData.password
        });
        
        if (saveResult && saveResult.success) {
          importedCount++;
        } else {
          failedCount++;
          console.warn('Не удалось импортировать пароль:', passwordData.domain, passwordData.username);
        }
      } catch (error) {
        failedCount++;
        console.error('Ошибка при импорте пароля:', error);
      }
    }
    
    // Очищаем сессию PIN после импорта
    await chrome.runtime.sendMessage({ action: 'clearSessionPin' });
    
    if (importedCount > 0) {
      successDiv.textContent = `Успешно импортировано ${importedCount} паролей${failedCount > 0 ? ` (${failedCount} ошибок)` : ''}!`;
      successDiv.style.display = 'block';
    } else {
      errorDiv.textContent = `Не удалось импортировать пароли${failedCount > 0 ? ` (${failedCount} ошибок)` : ''}`;
      errorDiv.style.display = 'block';
      return;
    }
    
    document.getElementById('import-pin').value = '';
    document.getElementById('import-file').value = '';
    document.getElementById('import-file-name').textContent = '';
    document.getElementById('import-confirm-btn').style.display = 'none';
    selectedImportFile = null;
    
    setTimeout(() => {
      successDiv.style.display = 'none';
    }, 3000);
  } catch (error) {
    console.error('Ошибка при импорте паролей:', error);
    if (error.message.includes('PIN-код') || error.message.includes('расшифровке')) {
      errorDiv.textContent = 'Неверный PIN-код или повреждённые данные';
    } else {
      errorDiv.textContent = 'Ошибка при импорте паролей: ' + error.message;
    }
    errorDiv.style.display = 'block';
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('Ошибка при чтении файла'));
    reader.readAsText(file);
  });
}

async function hashPin(pin) {
  // Сохраняем совместимость: без соли возвращаем legacy SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPin(pin) {
  try {
    const { pinHash, pinSalt, pinHashAlg } = await chrome.storage.local.get(['pinHash', 'pinSalt', 'pinHashAlg']);
    if (!pinHash) {
      return false;
    }

    const PIN_PBKDF2_ITERATIONS = 200000;

    const base64ToBytes = (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0));

    const constantTimeCompare = (a, b) => {
      if (typeof a !== 'string' || typeof b !== 'string') return false;
      const maxLen = Math.max(a.length, b.length);
      let res = 0;
      for (let i = 0; i < maxLen; i++) {
        const ac = i < a.length ? a.charCodeAt(i) : 0;
        const bc = i < b.length ? b.charCodeAt(i) : 0;
        res |= ac ^ bc;
      }
      if (a.length !== b.length) res |= 1;
      return res === 0;
    };

    const computePinHash = async (pinValue, saltBytes) => {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(pinValue),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBytes,
          iterations: PIN_PBKDF2_ITERATIONS,
          hash: 'SHA-256'
        },
        keyMaterial,
        256
      );
      const hashArray = Array.from(new Uint8Array(derivedBits));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    let isValid = false;

    if (pinSalt && pinHashAlg === 'pbkdf2-v1') {
      const saltBytes = base64ToBytes(pinSalt);
      const computed = await computePinHash(pin, saltBytes);
      isValid = constantTimeCompare(computed, pinHash);
    } else {
      // Legacy SHA-256 без соли
      const legacyHash = await hashPin(pin);
      isValid = constantTimeCompare(legacyHash, pinHash);
      if (isValid) {
        // Мигрируем на PBKDF2 через фоновые утилиты
        await savePinHash(pin);
      }
    }

    return isValid;
  } catch (error) {
    console.error('Ошибка при проверке PIN:', error);
    return false;
  }
}

async function checkPinForPasswords() {
  const pinSet = await isPinSet();
  if (!pinSet) {
    document.getElementById('passwords-pin-required').style.display = 'block';
    document.getElementById('passwords-list-container').style.display = 'none';
    return;
  }
  
  // Проверяем, есть ли уже PIN в сессии
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkSessionPin' });
    if (response && response.hasPin) {
      document.getElementById('passwords-pin-required').style.display = 'none';
      document.getElementById('passwords-list-container').style.display = 'block';
      await loadSavedPasswords();
    } else {
      document.getElementById('passwords-pin-required').style.display = 'block';
      document.getElementById('passwords-list-container').style.display = 'none';
    }
  } catch (error) {
    document.getElementById('passwords-pin-required').style.display = 'block';
    document.getElementById('passwords-list-container').style.display = 'none';
  }
}

async function verifyPinForPasswords() {
  const pin = document.getElementById('passwords-view-pin').value;
  const errorDiv = document.getElementById('passwords-pin-error');
  
  errorDiv.style.display = 'none';
  
  if (!pin || pin.length < 6 || pin.length > 12) {
    errorDiv.textContent = 'PIN-код должен содержать от 6 до 12 символов (цифры и буквы)';
    errorDiv.style.display = 'block';
    return;
  }
  
  const hasDigit = /[0-9]/.test(pin);
  const hasLetter = /[a-zA-Z]/.test(pin);
  if (!hasDigit || !hasLetter) {
    errorDiv.textContent = 'PIN-код должен содержать хотя бы одну цифру и одну букву';
    errorDiv.style.display = 'block';
    return;
  }
  
  try {
    const isValid = await verifyPin(pin);
    if (!isValid) {
      errorDiv.textContent = 'Неверный PIN-код';
      errorDiv.style.display = 'block';
      document.getElementById('passwords-view-pin').value = '';
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'verifyAndSetPin',
      pin: pin
    });
    
    if (response && response.success) {
      document.getElementById('passwords-pin-required').style.display = 'none';
      document.getElementById('passwords-list-container').style.display = 'block';
      document.getElementById('passwords-view-pin').value = '';
      await loadSavedPasswords();
    } else {
      errorDiv.textContent = response?.error || 'Неверный PIN-код';
      errorDiv.style.display = 'block';
      document.getElementById('passwords-view-pin').value = '';
    }
  } catch (error) {
    errorDiv.textContent = error.message || 'Ошибка при проверке PIN-кода';
    errorDiv.style.display = 'block';
    document.getElementById('passwords-view-pin').value = '';
  }
}

async function loadSavedPasswords() {
  const container = document.getElementById('passwords-table-container');
  container.innerHTML = '<div class="empty-state">Загрузка паролей...</div>';
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAllPasswords' });
    if (chrome.runtime.lastError) {
      container.innerHTML = '<div class="empty-state">Ошибка загрузки паролей</div>';
      return;
    }
    
    if (response && response.passwords) {
      allSavedPasswords = response.passwords;
      updateCategoryAndTagFilters();
      renderPasswordsTable(allSavedPasswords);
    } else if (response && response.error) {
      if (response.error.includes('PIN')) {
        savedPasswordsPin = null;
        document.getElementById('passwords-pin-required').style.display = 'block';
        document.getElementById('passwords-list-container').style.display = 'none';
      } else {
        allSavedPasswords = [];
        renderPasswordsTable([]);
      }
    } else {
      allSavedPasswords = [];
      renderPasswordsTable([]);
    }
  } catch (error) {
    console.error('Ошибка при загрузке паролей:', error);
    container.innerHTML = '<div class="empty-state">Ошибка загрузки паролей</div>';
  }
}

function renderPasswordsTable(passwords) {
  const container = document.getElementById('passwords-table-container');
  container.innerHTML = '';
  
  if (!passwords || passwords.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет сохранённых паролей</div>';
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'passwords-table';
  
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>Домен</th>
      <th>Логин</th>
      <th>Пароль</th>
      <th>Сила</th>
      <th>Категория</th>
      <th>Теги</th>
      <th>URL</th>
      <th>Экспорт</th>
      <th>Действия</th>
    </tr>
  `;
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  passwords.forEach((pwd, index) => {
    const passwordToken = `pwd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${index}`;
    passwordStore.set(passwordToken, pwd.password || '');
    
    const row = document.createElement('tr');
    
    const domainCell = document.createElement('td');
    domainCell.textContent = pwd.domain || '';
    
    const usernameCell = document.createElement('td');
    usernameCell.textContent = pwd.username || '';
    
    const passwordCell = document.createElement('td');
    passwordCell.className = 'password-cell';
    const passwordDisplay = document.createElement('span');
    passwordDisplay.className = 'password-display-cell';
    passwordDisplay.textContent = '••••••••';
    passwordDisplay.setAttribute('data-token', passwordToken);
    passwordCell.appendChild(passwordDisplay);
    
    const strengthCell = document.createElement('td');
    const strength = checkPasswordStrength(pwd.password || '');
    const strengthIndicator = document.createElement('div');
    strengthIndicator.className = 'password-strength-badge';
    strengthIndicator.style.cssText = `
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      background-color: ${strength.color}20;
      color: ${strength.color};
      border: 1px solid ${strength.color}40;
    `;
    strengthIndicator.textContent = strength.label;
    strengthCell.appendChild(strengthIndicator);
    
    const categoryCell = document.createElement('td');
    const categorySelect = document.createElement('select');
    categorySelect.className = 'category-select';
    categorySelect.style.cssText = 'width: 100%; padding: 4px; font-size: 12px;';
    const emptyCategoryOption = document.createElement('option');
    emptyCategoryOption.value = '';
    emptyCategoryOption.textContent = 'Без категории';
    categorySelect.appendChild(emptyCategoryOption);
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      if (pwd.category === cat) {
        option.selected = true;
      }
      categorySelect.appendChild(option);
    });
    categorySelect.addEventListener('change', async (e) => {
      await updatePasswordCategory(pwd, e.target.value);
    });
    categoryCell.appendChild(categorySelect);
    
    const tagsCell = document.createElement('td');
    const tagsInput = document.createElement('input');
    tagsInput.type = 'text';
    tagsInput.className = 'tags-input';
    tagsInput.style.cssText = 'width: 100%; padding: 4px; font-size: 12px;';
    tagsInput.value = (pwd.tags || []).join(', ');
    tagsInput.placeholder = 'Теги через запятую';
    tagsInput.addEventListener('blur', async () => {
      await updatePasswordTags(pwd, tagsInput.value);
    });
    tagsCell.appendChild(tagsInput);
    
    const urlCell = document.createElement('td');
    urlCell.style.cssText = 'max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    urlCell.textContent = pwd.url || '';
    if (pwd.url) {
      urlCell.title = pwd.url;
    }
    
    const exportCell = document.createElement('td');
    const exportCheckbox = document.createElement('input');
    exportCheckbox.type = 'checkbox';
    exportCheckbox.checked = pwd.allowExport !== false;
    exportCheckbox.addEventListener('change', async () => {
      await updatePasswordExportSetting(pwd, exportCheckbox.checked);
    });
    exportCell.appendChild(exportCheckbox);
    
    const actionsCell = document.createElement('td');
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'password-actions';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit';
    editBtn.textContent = 'Редактировать';
    editBtn.setAttribute('data-index', index.toString());
    editBtn.setAttribute('data-token', passwordToken);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-password';
    deleteBtn.textContent = 'Удалить';
    deleteBtn.setAttribute('data-index', index.toString());
    deleteBtn.setAttribute('data-domain', escapeHtml(pwd.domain || ''));
    deleteBtn.setAttribute('data-url', escapeHtml(pwd.url || ''));
    deleteBtn.setAttribute('data-username', escapeHtml(pwd.username || ''));
    
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    actionsCell.appendChild(actionsDiv);
    
    row.appendChild(domainCell);
    row.appendChild(usernameCell);
    row.appendChild(passwordCell);
    row.appendChild(strengthCell);
    row.appendChild(categoryCell);
    row.appendChild(tagsCell);
    row.appendChild(urlCell);
    row.appendChild(exportCell);
    row.appendChild(actionsCell);
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);
  
  container.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      const token = e.target.getAttribute('data-token');
      const password = token ? passwordStore.get(token) : '';
      const pwd = { ...passwords[index] };
      if (password) {
        pwd.password = password;
      }
      editPassword(pwd, index);
    });
  });
  
  container.querySelectorAll('.btn-delete-password').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const domain = btn.getAttribute('data-domain') || '';
      const url = btn.getAttribute('data-url') || '';
      const username = btn.getAttribute('data-username') || '';
      if (confirm(`Вы уверены, что хотите удалить пароль для ${username} на ${domain}?`)) {
        await deleteSavedPassword(domain, url, username);
      }
    });
  });
  
  container.querySelectorAll('.password-display-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      const token = e.target.getAttribute('data-token');
      if (!token) return;
      
      const password = passwordStore.get(token) || '';
      if (e.target.textContent === '••••••••') {
        e.target.textContent = password || '••••••••';
      } else {
        e.target.textContent = '••••••••';
      }
    });
  });
  
  const now = Date.now();
  for (const [token, password] of passwordStore.entries()) {
    if (token.startsWith('pwd_')) {
      const timestamp = parseInt(token.split('_')[1]);
      if (now - timestamp > 10 * 60 * 1000) {
        passwordStore.delete(token);
      }
    }
  }
}

function filterPasswords(e) {
  const query = document.getElementById('passwords-search').value.toLowerCase();
  const categoryFilter = document.getElementById('category-filter').value;
  const tagFilter = document.getElementById('tag-filter').value;
  
  let filtered = allSavedPasswords.filter(pwd => {
    const matchesSearch = !query || 
      (pwd.domain || '').toLowerCase().includes(query) ||
      (pwd.username || '').toLowerCase().includes(query) ||
      (pwd.url || '').toLowerCase().includes(query);
    
    const matchesCategory = !categoryFilter || pwd.category === categoryFilter;
    
    const matchesTag = !tagFilter || 
      (pwd.tags && Array.isArray(pwd.tags) && pwd.tags.includes(tagFilter));
    
    return matchesSearch && matchesCategory && matchesTag;
  });
  
  renderPasswordsTable(filtered);
}

async function updatePasswordCategory(password, category) {
  try {
    await chrome.runtime.sendMessage({
      action: 'updatePasswordMetadata',
      domain: password.domain,
      url: password.url,
      username: password.username,
      category: category
    });
    await loadSavedPasswords();
  } catch (error) {
    console.error('Ошибка при обновлении категории:', error);
  }
}

async function updatePasswordTags(password, tagsString) {
  try {
    const newTags = tagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    const allTags = [...tags];
    newTags.forEach(tag => {
      if (!allTags.includes(tag)) {
        allTags.push(tag);
      }
    });
    tags = allTags;
    await chrome.storage.local.set({ passwordTags: tags });
    updateCategoryAndTagFilters();
    
    await chrome.runtime.sendMessage({
      action: 'updatePasswordMetadata',
      domain: password.domain,
      url: password.url,
      username: password.username,
      tags: newTags
    });
    await loadSavedPasswords();
  } catch (error) {
    console.error('Ошибка при обновлении тегов:', error);
  }
}

async function updatePasswordExportSetting(password, allowExport) {
  try {
    await chrome.runtime.sendMessage({
      action: 'updatePasswordMetadata',
      domain: password.domain,
      url: password.url,
      username: password.username,
      allowExport: allowExport
    });
  } catch (error) {
    console.error('Ошибка при обновлении настройки экспорта:', error);
  }
}

async function showDuplicatePasswords() {
  const duplicates = await findDuplicatePasswords(allSavedPasswords);
  const warningDiv = document.getElementById('duplicates-warning');
  
  if (duplicates.length === 0) {
    warningDiv.style.display = 'none';
    return;
  }
  
  warningDiv.textContent = '';

  const title = document.createElement('h4');
  title.textContent = '⚠️ Обнаружены дублирующиеся пароли:';
  warningDiv.appendChild(title);

  const list = document.createElement('ul');

  duplicates.forEach(dup => {
    const li = document.createElement('li');

    const strong = document.createElement('strong');
    strong.textContent = 'Пароль:';
    li.appendChild(strong);

    const text = document.createTextNode(` ${dup.password} используется на ${dup.count} сайтах:`);
    li.appendChild(text);

    const innerList = document.createElement('ul');
    dup.entries.forEach(entry => {
      const entryLi = document.createElement('li');
      entryLi.textContent = `${entry.domain} - ${entry.username}`;
      innerList.appendChild(entryLi);
    });

    li.appendChild(innerList);
    list.appendChild(li);
  });

  warningDiv.appendChild(list);

  const recommendation = document.createElement('p');
  const strongRec = document.createElement('strong');
  strongRec.textContent = 'Рекомендация:';
  recommendation.appendChild(strongRec);
  recommendation.appendChild(document.createTextNode(' Используйте уникальные пароли для каждого сайта.'));
  warningDiv.appendChild(recommendation);

  warningDiv.style.display = 'block';
  warningDiv.className = 'duplicates-warning';
}

async function addNewCategory() {
  const input = document.getElementById('new-category-input');
  const categoryName = input.value.trim();
  
  if (!categoryName) {
    return;
  }
  
  if (categories.includes(categoryName)) {
    alert('Эта категория уже существует');
    return;
  }
  
  categories.push(categoryName);
  await chrome.storage.local.set({ passwordCategories: categories });
  updateCategoryAndTagFilters();
  input.value = '';
}

function editPassword(password, index) {
  editingPassword = {
    oldDomain: password.domain,
    oldUrl: password.url,
    oldUsername: password.username,
    index: index
  };
  
  document.getElementById('edit-domain').value = password.domain || '';
  document.getElementById('edit-url').value = password.url || '';
  document.getElementById('edit-username').value = password.username || '';
  document.getElementById('edit-password').value = password.password || '';
  document.getElementById('edit-pin').value = '';
  
  document.getElementById('edit-password-error').style.display = 'none';
  document.getElementById('edit-password-success').style.display = 'none';
  
  document.getElementById('edit-password-modal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-password-modal').style.display = 'none';
  const passwordField = document.getElementById('edit-password');
  if (passwordField) {
    passwordField.value = '';
    passwordField.type = 'password';
  }
  editingPassword = null;
  document.getElementById('edit-domain').value = '';
  document.getElementById('edit-url').value = '';
  document.getElementById('edit-username').value = '';
  document.getElementById('edit-pin').value = '';
}

function toggleEditPasswordVisibility() {
  const passwordInput = document.getElementById('edit-password');
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
  } else {
    passwordInput.type = 'password';
  }
}

async function saveEditedPassword() {
  const newDomain = document.getElementById('edit-domain').value.trim();
  const newUrl = document.getElementById('edit-url').value.trim();
  const newUsername = document.getElementById('edit-username').value.trim();
  const newPassword = document.getElementById('edit-password').value;
  const pin = document.getElementById('edit-pin').value;
  const errorDiv = document.getElementById('edit-password-error');
  const successDiv = document.getElementById('edit-password-success');
  
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  
  if (!newDomain) {
    errorDiv.textContent = 'Введите домен';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (!newUrl) {
    errorDiv.textContent = 'Введите URL';
    errorDiv.style.display = 'block';
    return;
  }
  
  let parsedUrl;
  try {
    parsedUrl = new URL(newUrl.startsWith('http://') || newUrl.startsWith('https://') ? newUrl : `https://${newUrl}`);
  } catch (e) {
    errorDiv.textContent = 'Неверный формат URL';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    errorDiv.textContent = 'Поддерживаются только HTTP и HTTPS протоколы';
    errorDiv.style.display = 'block';
    return;
  }
  
  const normalizedDomain = parsedUrl.hostname.toLowerCase();
  
  if (!newUsername) {
    errorDiv.textContent = 'Введите логин';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (!newPassword) {
    errorDiv.textContent = 'Введите пароль';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (!pin) {
    errorDiv.textContent = 'Введите PIN-код для подтверждения';
    errorDiv.style.display = 'block';
    return;
  }
  
  try {
    const isValid = await verifyPin(pin);
    if (!isValid) {
      errorDiv.textContent = 'Неверный PIN-код';
      errorDiv.style.display = 'block';
      return;
    }
  } catch (error) {
    errorDiv.textContent = error.message || 'Ошибка при проверке PIN-кода';
    errorDiv.style.display = 'block';
    return;
  }
  
  await chrome.runtime.sendMessage({
    action: 'verifyAndSetPin',
    pin: pin
  });
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'updatePassword',
      oldDomain: editingPassword.oldDomain,
      oldUrl: editingPassword.oldUrl,
      oldUsername: editingPassword.oldUsername,
      newDomain: normalizedDomain,
      newUrl: parsedUrl.href,
      newUsername: newUsername,
      newPassword: newPassword
    });
    
    if (response && response.success) {
      successDiv.textContent = 'Пароль успешно обновлён!';
      successDiv.style.display = 'block';
      
      setTimeout(async () => {
        closeEditModal();
        await loadSavedPasswords();
      }, 1500);
    } else {
      errorDiv.textContent = response?.error || 'Ошибка при обновлении пароля';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Ошибка при обновлении пароля: ' + error.message;
    errorDiv.style.display = 'block';
  }
}

async function deleteSavedPassword(domain, url, username) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deletePassword',
      domain: domain,
      url: url,
      username: username
    });
    
    if (response && response.success) {
      await loadSavedPasswords();
    } else {
      alert('Не удалось удалить пароль');
    }
  } catch (error) {
    console.error('Ошибка при удалении пароля:', error);
    alert('Ошибка при удалении пароля');
  }
}

async function isPinSet() {
  try {
    const result = await chrome.storage.local.get(['pinHash']);
    return !!result.pinHash;
  } catch (error) {
    return false;
  }
}

window.addEventListener('beforeunload', () => {
  passwordStore.clear();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    const now = Date.now();
    for (const [token, password] of passwordStore.entries()) {
      if (token.startsWith('pwd_')) {
        const timestamp = parseInt(token.split('_')[1]);
        if (now - timestamp > 5 * 60 * 1000) {
          passwordStore.delete(token);
        }
      }
    }
  }
});

let allDataCards = [];
let editingDataCard = null;
let dataCategories = [];
let dataTags = [];

async function loadDataCategoriesAndTags() {
  try {
    const result = await chrome.storage.local.get(['dataCategories', 'dataTags']);
    dataCategories = result.dataCategories || [];
    dataTags = result.dataTags || [];
    updateDataCategoryAndTagFilters();
  } catch (error) {
    console.error('Ошибка при загрузке категорий и тегов данных:', error);
    dataCategories = [];
    dataTags = [];
  }
}

function updateDataCategoryAndTagFilters() {
  const categoryFilter = document.getElementById('data-category-filter');
  const tagFilter = document.getElementById('data-tag-filter');
  const editCategorySelect = document.getElementById('edit-data-category');
  
  categoryFilter.innerHTML = '<option value="">Все категории</option>';
  dataCategories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categoryFilter.appendChild(option);
  });
  
  tagFilter.innerHTML = '<option value="">Все теги</option>';
  dataTags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    tagFilter.appendChild(option);
  });
  
  if (editCategorySelect) {
    editCategorySelect.innerHTML = '<option value="">Без категории</option>';
    dataCategories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      editCategorySelect.appendChild(option);
    });
  }
}

async function checkPinForData() {
  const pinSet = await isPinSet();
  if (!pinSet) {
    document.getElementById('data-pin-required').style.display = 'block';
    document.getElementById('data-list-container').style.display = 'none';
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkSessionPin' });
    if (response && response.hasPin) {
      document.getElementById('data-pin-required').style.display = 'none';
      document.getElementById('data-list-container').style.display = 'block';
      await loadDataCards();
    } else {
      document.getElementById('data-pin-required').style.display = 'block';
      document.getElementById('data-list-container').style.display = 'none';
    }
  } catch (error) {
    document.getElementById('data-pin-required').style.display = 'block';
    document.getElementById('data-list-container').style.display = 'none';
  }
}

async function verifyPinForData() {
  const pin = document.getElementById('data-view-pin').value;
  const errorDiv = document.getElementById('data-pin-error');
  
  errorDiv.style.display = 'none';
  
  if (!pin || pin.length < 6 || pin.length > 12) {
    errorDiv.textContent = 'PIN-код должен содержать от 6 до 12 символов (цифры и буквы)';
    errorDiv.style.display = 'block';
    return;
  }
  
  const hasDigit = /[0-9]/.test(pin);
  const hasLetter = /[a-zA-Z]/.test(pin);
  if (!hasDigit || !hasLetter) {
    errorDiv.textContent = 'PIN-код должен содержать хотя бы одну цифру и одну букву';
    errorDiv.style.display = 'block';
    return;
  }
  
  try {
    const isValid = await verifyPin(pin);
    if (!isValid) {
      errorDiv.textContent = 'Неверный PIN-код';
      errorDiv.style.display = 'block';
      document.getElementById('data-view-pin').value = '';
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'verifyAndSetPin',
      pin: pin
    });
    
    if (response && response.success) {
      document.getElementById('data-pin-required').style.display = 'none';
      document.getElementById('data-list-container').style.display = 'block';
      document.getElementById('data-view-pin').value = '';
      await loadDataCards();
    } else {
      errorDiv.textContent = response?.error || 'Неверный PIN-код';
      errorDiv.style.display = 'block';
      document.getElementById('data-view-pin').value = '';
    }
  } catch (error) {
    errorDiv.textContent = error.message || 'Ошибка при проверке PIN-кода';
    errorDiv.style.display = 'block';
    document.getElementById('data-view-pin').value = '';
  }
}

async function loadDataCards() {
  const container = document.getElementById('data-table-container');
  container.innerHTML = '<div class="empty-state">Загрузка данных...</div>';
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAllDataCards' });
    if (chrome.runtime.lastError) {
      container.innerHTML = '<div class="empty-state">Ошибка загрузки данных</div>';
      return;
    }
    
    if (response && response.cards) {
      allDataCards = response.cards;
      updateDataCategoryAndTagFilters();
      renderDataCardsTable(allDataCards);
    } else if (response && response.error) {
      if (response.error.includes('PIN')) {
        document.getElementById('data-pin-required').style.display = 'block';
        document.getElementById('data-list-container').style.display = 'none';
      } else {
        allDataCards = [];
        renderDataCardsTable([]);
      }
    } else {
      allDataCards = [];
      renderDataCardsTable([]);
    }
  } catch (error) {
    console.error('Ошибка при загрузке карточек данных:', error);
    container.innerHTML = '<div class="empty-state">Ошибка загрузки данных</div>';
  }
}

function renderDataCardsTable(cards) {
  const container = document.getElementById('data-table-container');
  container.innerHTML = '';
  
  if (!cards || cards.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет сохранённых карточек данных</div>';
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'passwords-table';
  
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>ФИО</th>
      <th>Телефон</th>
      <th>Почта</th>
      <th>Категория</th>
      <th>Теги</th>
      <th>Действия</th>
    </tr>
  `;
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  cards.forEach((card, index) => {
    const row = document.createElement('tr');
    row.style.cursor = 'pointer';
    
    const fio = `${card.lastName || ''} ${card.firstName || ''} ${card.middleName || ''}`.trim() || 'Без имени';
    
    const fioCell = document.createElement('td');
    fioCell.textContent = fio;
    
    const phoneCell = document.createElement('td');
    phoneCell.textContent = card.phone || '—';
    
    const emailCell = document.createElement('td');
    emailCell.textContent = card.email || '—';
    
    const categoryCell = document.createElement('td');
    categoryCell.textContent = card.category || '—';
    
    const tagsCell = document.createElement('td');
    tagsCell.textContent = (card.tags || []).join(', ') || '—';
    
    const actionsCell = document.createElement('td');
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'password-actions';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit';
    editBtn.textContent = 'Редактировать';
    editBtn.setAttribute('data-index', index.toString());
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-password';
    deleteBtn.textContent = 'Удалить';
    deleteBtn.setAttribute('data-index', index.toString());
    
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    actionsCell.appendChild(actionsDiv);
    
    row.appendChild(fioCell);
    row.appendChild(phoneCell);
    row.appendChild(emailCell);
    row.appendChild(categoryCell);
    row.appendChild(tagsCell);
    row.appendChild(actionsCell);
    
    row.addEventListener('click', (e) => {
      if (!e.target.closest('button')) {
        editDataCard(card, index);
      }
    });
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);
  
  container.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.getAttribute('data-index'));
      editDataCard(cards[index], index);
    });
  });
  
  container.querySelectorAll('.btn-delete-password').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.getAttribute('data-index'));
      const card = cards[index];
      const fio = `${card.lastName || ''} ${card.firstName || ''} ${card.middleName || ''}`.trim() || 'Без имени';
      if (confirm(`Вы уверены, что хотите удалить карточку "${fio}"?`)) {
        await deleteDataCardById(index);
      }
    });
  });
}

function filterDataCards() {
  const query = document.getElementById('data-search').value.toLowerCase();
  const categoryFilter = document.getElementById('data-category-filter').value;
  const tagFilter = document.getElementById('data-tag-filter').value;
  
  let filtered = allDataCards.filter(card => {
    const fio = `${card.lastName || ''} ${card.firstName || ''} ${card.middleName || ''}`.toLowerCase();
    const matchesSearch = !query || 
      fio.includes(query) ||
      (card.phone || '').toLowerCase().includes(query) ||
      (card.email || '').toLowerCase().includes(query);
    
    const matchesCategory = !categoryFilter || card.category === categoryFilter;
    
    const matchesTag = !tagFilter || 
      (card.tags && Array.isArray(card.tags) && card.tags.includes(tagFilter));
    
    return matchesSearch && matchesCategory && matchesTag;
  });
  
  renderDataCardsTable(filtered);
}

async function addNewDataCategory() {
  const input = document.getElementById('new-data-category-input');
  const categoryName = input.value.trim();
  
  if (!categoryName) {
    return;
  }
  
  if (dataCategories.includes(categoryName)) {
    alert('Эта категория уже существует');
    return;
  }
  
  dataCategories.push(categoryName);
  await chrome.storage.local.set({ dataCategories: dataCategories });
  updateDataCategoryAndTagFilters();
  input.value = '';
}

function openAddDataModal() {
  editingDataCard = null;
  document.getElementById('edit-data-modal-title').textContent = 'Добавить карточку данных';
  document.getElementById('delete-data-btn').style.display = 'none';
  
  document.getElementById('edit-lastName').value = '';
  document.getElementById('edit-firstName').value = '';
  document.getElementById('edit-middleName').value = '';
  document.getElementById('edit-birthDate').value = '';
  document.getElementById('edit-phone').value = '';
  document.getElementById('edit-email').value = '';
  document.getElementById('edit-address').value = '';
  document.getElementById('edit-workplace').value = '';
  document.getElementById('edit-data-category').value = '';
  document.getElementById('edit-data-tags').value = '';
  document.getElementById('edit-data-pin').value = '';
  
  document.getElementById('edit-data-error').style.display = 'none';
  document.getElementById('edit-data-success').style.display = 'none';
  
  document.getElementById('edit-data-modal').style.display = 'flex';
}

function editDataCard(card, index) {
  editingDataCard = { card, index };
  document.getElementById('edit-data-modal-title').textContent = 'Редактировать карточку данных';
  document.getElementById('delete-data-btn').style.display = 'block';
  
  document.getElementById('edit-lastName').value = card.lastName || '';
  document.getElementById('edit-firstName').value = card.firstName || '';
  document.getElementById('edit-middleName').value = card.middleName || '';
  document.getElementById('edit-birthDate').value = card.birthDate || '';
  document.getElementById('edit-phone').value = card.phone || '';
  document.getElementById('edit-email').value = card.email || '';
  document.getElementById('edit-address').value = card.address || '';
  document.getElementById('edit-workplace').value = card.workplace || '';
  document.getElementById('edit-data-category').value = card.category || '';
  document.getElementById('edit-data-tags').value = (card.tags || []).join(', ');
  document.getElementById('edit-data-pin').value = '';
  
  document.getElementById('edit-data-error').style.display = 'none';
  document.getElementById('edit-data-success').style.display = 'none';
  
  document.getElementById('edit-data-modal').style.display = 'flex';
}

function closeEditDataModal() {
  document.getElementById('edit-data-modal').style.display = 'none';
  editingDataCard = null;
  document.getElementById('edit-lastName').value = '';
  document.getElementById('edit-firstName').value = '';
  document.getElementById('edit-middleName').value = '';
  document.getElementById('edit-birthDate').value = '';
  document.getElementById('edit-phone').value = '';
  document.getElementById('edit-email').value = '';
  document.getElementById('edit-address').value = '';
  document.getElementById('edit-workplace').value = '';
  document.getElementById('edit-data-category').value = '';
  document.getElementById('edit-data-tags').value = '';
  document.getElementById('edit-data-pin').value = '';
}

async function saveDataCard() {
  const pin = document.getElementById('edit-data-pin').value;
  const errorDiv = document.getElementById('edit-data-error');
  const successDiv = document.getElementById('edit-data-success');
  
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  
  if (!pin) {
    errorDiv.textContent = 'Введите PIN-код для подтверждения';
    errorDiv.style.display = 'block';
    return;
  }
  
  try {
    const isValid = await verifyPin(pin);
    if (!isValid) {
      errorDiv.textContent = 'Неверный PIN-код';
      errorDiv.style.display = 'block';
      return;
    }
    
    await chrome.runtime.sendMessage({
      action: 'verifyAndSetPin',
      pin: pin
    });
    
    const cardData = {
      lastName: document.getElementById('edit-lastName').value.trim(),
      firstName: document.getElementById('edit-firstName').value.trim(),
      middleName: document.getElementById('edit-middleName').value.trim(),
      birthDate: document.getElementById('edit-birthDate').value.trim(),
      phone: document.getElementById('edit-phone').value.trim(),
      email: document.getElementById('edit-email').value.trim(),
      address: document.getElementById('edit-address').value.trim(),
      workplace: document.getElementById('edit-workplace').value.trim(),
      category: document.getElementById('edit-data-category').value.trim() || null,
      tags: document.getElementById('edit-data-tags').value.split(',').map(t => t.trim()).filter(t => t.length > 0),
      createdAt: editingDataCard ? editingDataCard.card.createdAt : Date.now(),
      updatedAt: Date.now()
    };
    
    const allTags = [...dataTags];
    cardData.tags.forEach(tag => {
      if (!allTags.includes(tag)) {
        allTags.push(tag);
      }
    });
    dataTags = allTags;
    await chrome.storage.local.set({ dataTags: dataTags });
    updateDataCategoryAndTagFilters();
    
    const response = await chrome.runtime.sendMessage({
      action: editingDataCard ? 'updateDataCard' : 'saveDataCard',
      cardIndex: editingDataCard ? editingDataCard.index : null,
      cardData: cardData
    });
    
    if (response && response.success) {
      successDiv.textContent = editingDataCard ? 'Карточка успешно обновлена!' : 'Карточка успешно добавлена!';
      successDiv.style.display = 'block';
      
      setTimeout(async () => {
        closeEditDataModal();
        await loadDataCards();
      }, 1500);
    } else {
      errorDiv.textContent = response?.error || 'Ошибка при сохранении карточки';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Ошибка при сохранении карточки: ' + error.message;
    errorDiv.style.display = 'block';
  }
}

async function deleteDataCard() {
  if (!editingDataCard) return;
  
  const pin = document.getElementById('edit-data-pin').value;
  const errorDiv = document.getElementById('edit-data-error');
  
  if (!pin) {
    errorDiv.textContent = 'Введите PIN-код для подтверждения удаления';
    errorDiv.style.display = 'block';
    return;
  }
  
  try {
    const isValid = await verifyPin(pin);
    if (!isValid) {
      errorDiv.textContent = 'Неверный PIN-код';
      errorDiv.style.display = 'block';
      return;
    }
    
    await deleteDataCardById(editingDataCard.index);
    closeEditDataModal();
  } catch (error) {
    errorDiv.textContent = 'Ошибка при удалении карточки: ' + error.message;
    errorDiv.style.display = 'block';
  }
}

async function deleteDataCardById(index) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteDataCard',
      cardIndex: index
    });
    
    if (response && response.success) {
      await loadDataCards();
    } else {
      alert('Не удалось удалить карточку');
    }
  } catch (error) {
    console.error('Ошибка при удалении карточки:', error);
    alert('Ошибка при удалении карточки');
  }
}

// TOTP функции для настроек
let allTotpList = [];
let editingTotpIndex = null;

async function checkPinForTotp() {
  const pinSet = await isPinSet();
  if (!pinSet) {
    document.getElementById('totp-pin-required').style.display = 'block';
    document.getElementById('totp-list-container').style.display = 'none';
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkSessionPin' });
    if (response && response.hasPin) {
      document.getElementById('totp-pin-required').style.display = 'none';
      document.getElementById('totp-list-container').style.display = 'block';
      await loadTotpSettings();
    } else {
      document.getElementById('totp-pin-required').style.display = 'block';
      document.getElementById('totp-list-container').style.display = 'none';
    }
  } catch (error) {
    document.getElementById('totp-pin-required').style.display = 'block';
    document.getElementById('totp-list-container').style.display = 'none';
  }
}

async function verifyPinForTotp() {
  const pin = document.getElementById('totp-view-pin').value;
  const errorDiv = document.getElementById('totp-pin-error');
  
  errorDiv.style.display = 'none';
  
  if (!pin || pin.length < 6 || pin.length > 12) {
    errorDiv.textContent = 'PIN-код должен содержать от 6 до 12 символов (цифры и буквы)';
    errorDiv.style.display = 'block';
    return;
  }
  
  const hasDigit = /[0-9]/.test(pin);
  const hasLetter = /[a-zA-Z]/.test(pin);
  if (!hasDigit || !hasLetter) {
    errorDiv.textContent = 'PIN-код должен содержать хотя бы одну цифру и одну букву';
    errorDiv.style.display = 'block';
    return;
  }
  
  try {
    const isValid = await verifyPin(pin);
    if (!isValid) {
      errorDiv.textContent = 'Неверный PIN-код';
      errorDiv.style.display = 'block';
      document.getElementById('totp-view-pin').value = '';
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'verifyAndSetPin',
      pin: pin
    });
    
    if (response && response.success) {
      document.getElementById('totp-pin-required').style.display = 'none';
      document.getElementById('totp-list-container').style.display = 'block';
      document.getElementById('totp-view-pin').value = '';
      await loadTotpSettings();
    } else {
      errorDiv.textContent = response?.error || 'Неверный PIN-код';
      errorDiv.style.display = 'block';
      document.getElementById('totp-view-pin').value = '';
    }
  } catch (error) {
    errorDiv.textContent = error.message || 'Ошибка при проверке PIN-кода';
    errorDiv.style.display = 'block';
    document.getElementById('totp-view-pin').value = '';
  }
}

async function loadTotpSettings() {
  const container = document.getElementById('totp-table-container');
  container.innerHTML = '<div class="empty-state">Загрузка 2FA кодов...</div>';
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAllTotp' });
    if (chrome.runtime.lastError) {
      container.innerHTML = '<div class="empty-state">Ошибка загрузки 2FA кодов</div>';
      return;
    }
    
    if (response && response.totpList) {
      allTotpList = response.totpList;
      renderTotpTable(allTotpList);
    } else {
      allTotpList = [];
      renderTotpTable([]);
    }
  } catch (error) {
    console.error('Ошибка при загрузке 2FA кодов:', error);
    container.innerHTML = '<div class="empty-state">Ошибка загрузки 2FA кодов</div>';
  }
}

function renderTotpTable(totpList) {
  const container = document.getElementById('totp-table-container');
  container.innerHTML = '';
  
  if (!totpList || totpList.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет сохранённых 2FA кодов</div>';
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'passwords-table';
  
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>Сервис</th>
      <th>Логин</th>
      <th>Код</th>
      <th>Действия</th>
    </tr>
  `;
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  totpList.forEach((totp, index) => {
    const row = document.createElement('tr');
    
    const serviceCell = document.createElement('td');
    serviceCell.textContent = totp.service || 'Без названия';
    
    const loginCell = document.createElement('td');
    loginCell.textContent = totp.login || '—';
    
    const codeCell = document.createElement('td');
    codeCell.className = 'totp-code-cell';
    const codeDisplay = document.createElement('span');
    codeDisplay.className = 'totp-code-display';
    codeDisplay.textContent = '••••••';
    codeDisplay.setAttribute('data-index', index.toString());
    codeDisplay.setAttribute('data-secret', totp.secret);
    codeCell.appendChild(codeDisplay);
    
    const actionsCell = document.createElement('td');
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'password-actions';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit';
    editBtn.textContent = 'Редактировать';
    editBtn.setAttribute('data-index', index.toString());
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-password';
    deleteBtn.textContent = 'Удалить';
    deleteBtn.setAttribute('data-index', index.toString());
    
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    actionsCell.appendChild(actionsDiv);
    
    row.appendChild(serviceCell);
    row.appendChild(loginCell);
    row.appendChild(codeCell);
    row.appendChild(actionsCell);
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);
  
  // Обработчики событий
  container.querySelectorAll('.totp-code-display').forEach(cell => {
    cell.addEventListener('click', async (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      const secret = e.target.getAttribute('data-secret');
      
      if (e.target.textContent === '••••••') {
        try {
          const code = await generateTOTP(secret);
          e.target.textContent = code;
          
          setTimeout(() => {
            e.target.textContent = '••••••';
          }, 30000); // Скрыть через 30 секунд
        } catch (error) {
          console.error('Ошибка при генерации TOTP:', error);
          alert('Ошибка при генерации кода');
        }
      } else {
        e.target.textContent = '••••••';
      }
    });
  });
  
  container.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      editTotpSettings(index);
    });
  });
  
  container.querySelectorAll('.btn-delete-password').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      const totp = totpList[index];
      if (confirm(`Вы уверены, что хотите удалить 2FA код для ${totp.service} (${totp.login})?`)) {
        await deleteTotpById(index);
      }
    });
  });
}

function openAddTotpSettingsModal() {
  editingTotpIndex = null;
  document.getElementById('totp-settings-modal-title').textContent = 'Добавить 2FA';
  document.getElementById('delete-totp-settings-btn').style.display = 'none';
  
  document.getElementById('totp-settings-service').value = '';
  document.getElementById('totp-settings-login').value = '';
  document.getElementById('totp-settings-secret').value = '';
  
  document.getElementById('totp-settings-error').style.display = 'none';
  document.getElementById('totp-settings-success').style.display = 'none';
  
  document.getElementById('totp-settings-modal').style.display = 'flex';
}

function editTotpSettings(index) {
  editingTotpIndex = index;
  document.getElementById('totp-settings-modal-title').textContent = 'Редактировать 2FA';
  document.getElementById('delete-totp-settings-btn').style.display = 'block';
  
  if (allTotpList[index]) {
    const totp = allTotpList[index];
    document.getElementById('totp-settings-service').value = totp.service || '';
    document.getElementById('totp-settings-login').value = totp.login || '';
    document.getElementById('totp-settings-secret').value = totp.secret || '';
    
    document.getElementById('totp-settings-error').style.display = 'none';
    document.getElementById('totp-settings-success').style.display = 'none';
    
    document.getElementById('totp-settings-modal').style.display = 'flex';
  }
}

function closeTotpSettingsModal() {
  document.getElementById('totp-settings-modal').style.display = 'none';
  editingTotpIndex = null;
  document.getElementById('totp-settings-service').value = '';
  document.getElementById('totp-settings-login').value = '';
  document.getElementById('totp-settings-secret').value = '';
}

async function saveTotpSettings() {
  const service = document.getElementById('totp-settings-service').value.trim();
  const login = document.getElementById('totp-settings-login').value.trim();
  const secret = document.getElementById('totp-settings-secret').value.trim();
  const errorDiv = document.getElementById('totp-settings-error');
  const successDiv = document.getElementById('totp-settings-success');
  
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  
  if (!service) {
    errorDiv.textContent = 'Введите название сервиса';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (!login) {
    errorDiv.textContent = 'Введите логин для идентификации';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (!secret) {
    errorDiv.textContent = 'Введите секретный ключ';
    errorDiv.style.display = 'block';
    return;
  }
  
  if (!isValidSecret(secret)) {
    errorDiv.textContent = 'Неверный формат секретного ключа. Используйте Base32 или hex формат.';
    errorDiv.style.display = 'block';
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: editingTotpIndex !== null ? 'updateTotp' : 'saveTotp',
      index: editingTotpIndex,
      service: service,
      login: login,
      secret: secret
    });
    
    if (response && response.success) {
      successDiv.textContent = editingTotpIndex !== null ? '2FA код успешно обновлён!' : '2FA код успешно добавлен!';
      successDiv.style.display = 'block';
      
      setTimeout(async () => {
        closeTotpSettingsModal();
        await loadTotpSettings();
      }, 1500);
    } else {
      errorDiv.textContent = response?.error || 'Ошибка при сохранении 2FA кода';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Ошибка при сохранении 2FA кода: ' + error.message;
    errorDiv.style.display = 'block';
  }
}

async function deleteTotpSettings() {
  if (editingTotpIndex === null) return;
  
  if (confirm('Вы уверены, что хотите удалить этот 2FA код?')) {
    await deleteTotpById(editingTotpIndex);
    closeTotpSettingsModal();
  }
}

async function deleteTotpById(index) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteTotp',
      index: index
    });
    
    if (response && response.success) {
      await loadTotpSettings();
    } else {
      alert('Не удалось удалить 2FA код');
    }
  } catch (error) {
    console.error('Ошибка при удалении TOTP:', error);
    alert('Ошибка при удалении 2FA кода');
  }
}

// Функции для работы с биометрией
async function handleBiometricToggle() {
  const checkbox = document.getElementById('biometric-enabled');
  const errorDiv = document.getElementById('biometric-error');
  const successDiv = document.getElementById('biometric-success');
  
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  
  try {
    if (checkbox.checked) {
      // Проверяем, установлен ли PIN
      const pinSet = await isPinSet();
      if (!pinSet) {
        checkbox.checked = false;
        errorDiv.textContent = 'Сначала установите PIN-код';
        errorDiv.style.display = 'block';
        return;
      }
      
      // Проверяем, зарегистрирована ли биометрия
      const isRegistered = await isBiometricRegistered();
      if (!isRegistered) {
        checkbox.checked = false;
        errorDiv.textContent = 'Сначала настройте биометрию, нажав кнопку "Настроить биометрию"';
        errorDiv.style.display = 'block';
        return;
      }
      
      await chrome.storage.local.set({ biometricEnabled: true });
      successDiv.textContent = 'Биометрическая аутентификация включена';
      successDiv.style.display = 'block';
      setTimeout(() => {
        successDiv.style.display = 'none';
      }, 3000);
    } else {
      await chrome.storage.local.set({ biometricEnabled: false });
      successDiv.textContent = 'Биометрическая аутентификация отключена';
      successDiv.style.display = 'block';
      setTimeout(() => {
        successDiv.style.display = 'none';
      }, 3000);
    }
  } catch (error) {
    console.error('Ошибка при переключении биометрии:', error);
    checkbox.checked = !checkbox.checked;
    errorDiv.textContent = 'Ошибка при изменении настройки: ' + error.message;
    errorDiv.style.display = 'block';
  }
}

async function setupBiometric() {
  const errorDiv = document.getElementById('biometric-error');
  const successDiv = document.getElementById('biometric-success');
  const setupBtn = document.getElementById('setup-biometric-btn');
  
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  
  try {
    // Проверяем, установлен ли PIN
    const pinSet = await isPinSet();
    if (!pinSet) {
      errorDiv.textContent = 'Сначала установите PIN-код';
      errorDiv.style.display = 'block';
      return;
    }
    
    // Проверяем поддержку WebAuthn
    if (!isWebAuthnSupported()) {
      errorDiv.textContent = 'WebAuthn не поддерживается в вашем браузере';
      errorDiv.style.display = 'block';
      return;
    }
    
    setupBtn.disabled = true;
    setupBtn.textContent = 'Настройка...';
    
    // Генерируем уникальный ID пользователя на основе PIN hash
    const result = await chrome.storage.local.get(['pinHash']);
    const userId = result.pinHash || `user_${Date.now()}`;
    const userName = 'TOTC Pass User';
    
    // Регистрируем биометрию
    const registrationData = await registerBiometric(userId, userName);
    
    // Сохраняем данные
    await saveBiometricData(registrationData.credential.id, registrationData);
    
    // Показываем модальное окно для ввода PIN
    await new Promise((resolve, reject) => {
      // Сохраняем данные регистрации во временное хранилище
      window.tempBiometricRegistration = registrationData;
      
      // Показываем модальное окно
      document.getElementById('biometric-pin-modal').style.display = 'flex';
      document.getElementById('biometric-pin-input').focus();
      document.getElementById('biometric-pin-error').style.display = 'none';
      
      // Устанавливаем обработчики
      window.biometricPinResolve = resolve;
      window.biometricPinReject = reject;
    });
    
    // Обновляем UI
    await loadBiometricSettings();
    
    successDiv.textContent = 'Биометрическая аутентификация успешно настроена!';
    successDiv.style.display = 'block';
    setTimeout(() => {
      successDiv.style.display = 'none';
    }, 5000);
    
    // Обновляем чекбокс
    document.getElementById('biometric-enabled').checked = true;
  } catch (error) {
    console.error('Ошибка при настройке биометрии:', error);
    errorDiv.textContent = error.message || 'Ошибка при настройке биометрии';
    errorDiv.style.display = 'block';
  } finally {
    setupBtn.disabled = false;
    setupBtn.textContent = 'Настроить биометрию';
  }
}

async function removeBiometric() {
  if (!confirm('Вы уверены, что хотите удалить биометрическую аутентификацию?')) {
    return;
  }
  
  const errorDiv = document.getElementById('biometric-error');
  const successDiv = document.getElementById('biometric-success');
  
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  
  try {
    await removeBiometricData();
    await chrome.storage.local.set({ biometricEnabled: false });
    
    // Удаляем зашифрованный PIN
    await chrome.storage.local.remove(['biometricEncryptedPin', 'biometricPinKey']);
    
    // Обновляем UI
    await loadBiometricSettings();
    
    // Обновляем чекбокс
    document.getElementById('biometric-enabled').checked = false;
    
    successDiv.textContent = 'Биометрическая аутентификация удалена';
    successDiv.style.display = 'block';
    setTimeout(() => {
      successDiv.style.display = 'none';
    }, 3000);
  } catch (error) {
    console.error('Ошибка при удалении биометрии:', error);
    errorDiv.textContent = 'Ошибка при удалении биометрии: ' + error.message;
    errorDiv.style.display = 'block';
  }
}

async function saveBiometricPin() {
  const pinInput = document.getElementById('biometric-pin-input');
  const pin = pinInput.value;
  const errorDiv = document.getElementById('biometric-pin-error');
  const successDiv = document.getElementById('biometric-success');
  const errorDivMain = document.getElementById('biometric-error');
  
  errorDiv.style.display = 'none';
  errorDivMain.style.display = 'none';
  successDiv.style.display = 'none';
  
  if (!pin || pin.length < 6 || pin.length > 12) {
    errorDiv.textContent = 'PIN-код должен содержать от 6 до 12 символов (цифры и буквы)';
    errorDiv.style.display = 'block';
    return;
  }
  
  const hasDigit = /[0-9]/.test(pin);
  const hasLetter = /[a-zA-Z]/.test(pin);
  if (!hasDigit || !hasLetter) {
    errorDiv.textContent = 'PIN-код должен содержать хотя бы одну цифру и одну букву';
    errorDiv.style.display = 'block';
    return;
  }
  
  try {
    // Проверяем PIN
    const isValidPin = await verifyPin(pin);
    if (!isValidPin) {
      errorDiv.textContent = 'Неверный PIN-код';
      errorDiv.style.display = 'block';
      return;
    }
    
    // Сохраняем PIN в зашифрованном виде
    const savePinResponse = await chrome.runtime.sendMessage({
      action: 'saveBiometricPin',
      pin: pin
    });
    
    if (!savePinResponse || !savePinResponse.success) {
      throw new Error(savePinResponse?.error || 'Не удалось сохранить PIN для биометрии');
    }
    
    // Включаем биометрию
    await chrome.storage.local.set({ biometricEnabled: true });
    
    // Закрываем модальное окно
    closeBiometricPinModal();
    
    // Обновляем UI
    await loadBiometricSettings();
    
    // Обновляем чекбокс
    document.getElementById('biometric-enabled').checked = true;
    
    successDiv.textContent = 'Биометрическая аутентификация успешно настроена!';
    successDiv.style.display = 'block';
    setTimeout(() => {
      successDiv.style.display = 'none';
    }, 5000);
    
    // Вызываем resolve, если есть
    if (window.biometricPinResolve) {
      window.biometricPinResolve();
      window.biometricPinResolve = null;
      window.biometricPinReject = null;
    }
  } catch (error) {
    console.error('Ошибка при сохранении PIN для биометрии:', error);
    errorDiv.textContent = error.message || 'Ошибка при сохранении PIN';
    errorDiv.style.display = 'block';
    
    // Вызываем reject, если есть
    if (window.biometricPinReject) {
      window.biometricPinReject(error);
      window.biometricPinResolve = null;
      window.biometricPinReject = null;
    }
  }
}

function closeBiometricPinModal() {
  document.getElementById('biometric-pin-modal').style.display = 'none';
  document.getElementById('biometric-pin-input').value = '';
  document.getElementById('biometric-pin-error').style.display = 'none';
  
  // Очищаем временные данные
  if (window.biometricPinReject) {
    window.biometricPinReject(new Error('Отменено пользователем'));
    window.biometricPinResolve = null;
    window.biometricPinReject = null;
  }
  window.tempBiometricRegistration = null;
}


