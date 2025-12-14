let allPasswords = [];
let currentPin = null;
const passwordStore = new Map();

function generateNonce() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${crypto.getRandomValues(new Uint8Array(4)).join('')}`;
}

function sendSecureMessage(message, callback) {
  message.timestamp = Date.now();
  message.nonce = generateNonce();
  chrome.runtime.sendMessage(message, callback);
}

function clearPinFromMemory() {
  if (currentPin) {
    const pinLength = currentPin.length;
    if (pinLength > 0) {
      currentPin = '0'.repeat(pinLength);
    }
    currentPin = null;
  }
  chrome.runtime.sendMessage({ action: 'clearSessionPin' }, () => {});
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  setupEventListeners();
  checkPinAndLoad();
});

window.addEventListener('beforeunload', () => {
  clearPinFromMemory();
  clearPasswordsFromDOM();
  passwordStore.clear();
});

function clearPasswordsFromDOM() {
  const passwordInputs = document.querySelectorAll('.password-display');
  passwordInputs.forEach(input => {
    input.value = '';
    const token = input.getAttribute('data-token');
    if (token) {
      passwordStore.delete(token);
      input.removeAttribute('data-token');
    }
  });
  
  const copyButtons = document.querySelectorAll('.copy-btn');
  copyButtons.forEach(btn => {
    const token = btn.getAttribute('data-token');
    if (token) {
      passwordStore.delete(token);
      btn.removeAttribute('data-token');
    }
  });
  
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

let totpUpdateInterval = null;
let editingTotpIndex = null;

function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      button.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
      
      if (tabName === 'passwords') {
        initSubTabs();
        loadPasswords();
      } else if (tabName === 'totp') {
        loadTotpCodes();
        startTotpUpdate();
      } else {
        stopTotpUpdate();
      }
    });
  });
  
  // Инициализируем подвкладки для паролей
  initSubTabs();
}

function initSubTabs() {
  const subTabButtons = document.querySelectorAll('.sub-tab-button');
  const subTabContents = document.querySelectorAll('.sub-tab-content');

  subTabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const subTabName = button.dataset.subtab;
      
      subTabButtons.forEach(btn => btn.classList.remove('active'));
      subTabContents.forEach(content => content.classList.remove('active'));
      
      button.classList.add('active');
      document.getElementById(`${subTabName}-subtab`).classList.add('active');
      
      if (subTabName === 'current') {
        loadCurrentSitePasswords();
      } else if (subTabName === 'saved') {
        loadPasswords();
      }
    });
  });
}

function loadPasswords() {
  if (!currentPin) {
    checkPinAndLoad();
    return;
  }
  
  chrome.runtime.sendMessage({ action: 'getPendingPasswords' }, (pendingResponse) => {
    if (!chrome.runtime.lastError && pendingResponse && pendingResponse.passwords && pendingResponse.passwords.length > 0) {
      savePendingPasswords(currentPin).then(() => {
        loadPasswordsAfterPin();
      });
    } else {
      loadPasswordsAfterPin();
    }
  });
}

function loadPasswordsAfterPin() {
  sendSecureMessage({ action: 'getAllPasswords' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Ошибка при загрузке паролей:', chrome.runtime.lastError);
      setEmptyState('passwords-list', 'Ошибка загрузки паролей');
      return;
    }
    if (response && response.passwords) {
      allPasswords = response.passwords;
      renderPasswords(allPasswords);
      setupSearch();
    } else if (response && response.error) {
      if (response.error.includes('PIN')) {
        currentPin = null;
        showPinModal();
      } else {
        allPasswords = [];
        renderPasswords([]);
      }
    } else {
      allPasswords = [];
      renderPasswords([]);
    }
  });
}

function loadCurrentSitePasswords() {
  if (!currentPin) {
    return;
  }
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error('Ошибка при получении вкладки:', chrome.runtime.lastError);
      setEmptyState('current-site-passwords', 'Не удалось получить информацию о текущей вкладке');
      return;
    }
    
    if (tabs[0]) {
      try {
        const url = new URL(tabs[0].url);
        if (url.protocol === 'chrome:' || url.protocol === 'edge:' || url.protocol === 'about:') {
          setEmptyState('current-site-passwords', 'Эта функция недоступна на системных страницах');
          return;
        }
        
        const domain = url.hostname;
        
        chrome.runtime.sendMessage({ 
          action: 'getPasswords', 
          domain: domain 
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Ошибка при загрузке паролей:', chrome.runtime.lastError);
            setEmptyState('current-site-passwords', 'Ошибка загрузки паролей');
            return;
          }
          if (response && response.passwords && response.passwords.length > 0) {
            renderPasswords(response.passwords, 'current-site-passwords');
          } else if (response && response.error && response.error.includes('PIN')) {
            currentPin = null;
            setEmptyState('current-site-passwords', 'Требуется PIN-код');
          } else {
            setEmptyState('current-site-passwords', 'Нет сохранённых паролей для этого сайта');
          }
        });
      } catch (error) {
        console.error('Ошибка при обработке URL:', error);
        setEmptyState('current-site-passwords', 'Не удалось обработать URL текущей вкладки');
      }
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setEmptyState(containerId, message) {
  const container = document.getElementById(containerId);
  container.textContent = '';
  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  const emptyDiv = document.createElement('div');
  emptyDiv.textContent = message;
  emptyState.appendChild(emptyDiv);
  container.appendChild(emptyState);
}

function renderPasswords(passwords, containerId = 'passwords-list') {
  const container = document.getElementById(containerId);
  
  container.textContent = '';
  
  if (!passwords || passwords.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    const emptyDiv = document.createElement('div');
    emptyDiv.textContent = 'Нет сохранённых паролей';
    emptyState.appendChild(emptyDiv);
    container.appendChild(emptyState);
    return;
  }

  passwords.forEach((item, index) => {
    const passwordItem = document.createElement('div');
    passwordItem.className = 'password-item';
    passwordItem.setAttribute('data-index', index.toString());
    
    const passwordHeader = document.createElement('div');
    passwordHeader.className = 'password-header';
    
    const domainDiv = document.createElement('div');
    domainDiv.className = 'domain';
    domainDiv.textContent = item.domain || 'Неизвестный домен';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Удалить';
    deleteBtn.setAttribute('data-domain', escapeHtml(item.domain || ''));
    deleteBtn.setAttribute('data-url', escapeHtml(item.url || ''));
    deleteBtn.setAttribute('data-username', escapeHtml(item.username || ''));
    
    passwordHeader.appendChild(domainDiv);
    passwordHeader.appendChild(deleteBtn);
    
    const usernameDiv = document.createElement('div');
    usernameDiv.className = 'username';
    usernameDiv.textContent = item.username || '(без логина)';
    
    const passwordRow = document.createElement('div');
    passwordRow.className = 'password-row';
    
    const passwordToken = `pwd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    passwordStore.set(passwordToken, item.password || '');
    
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.className = 'password-display';
    passwordInput.value = '••••••••';
    passwordInput.readOnly = true;
    passwordInput.setAttribute('data-token', passwordToken);
    
    const showBtn = document.createElement('button');
    showBtn.className = 'show-password-btn';
    showBtn.textContent = 'Показать';
    showBtn.setAttribute('data-index', index.toString());
    showBtn.setAttribute('data-token', passwordToken);
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Копировать';
    copyBtn.setAttribute('data-token', passwordToken);
    
    passwordRow.appendChild(passwordInput);
    passwordRow.appendChild(showBtn);
    passwordRow.appendChild(copyBtn);
    
    const urlDiv = document.createElement('div');
    urlDiv.className = 'url';
    urlDiv.textContent = item.url || '';
    
    passwordItem.appendChild(passwordHeader);
    passwordItem.appendChild(usernameDiv);
    passwordItem.appendChild(passwordRow);
    passwordItem.appendChild(urlDiv);
    
    container.appendChild(passwordItem);
  });

  setupPasswordItemListeners(container);
}

function setupPasswordItemListeners(container) {
  container.querySelectorAll('.show-password-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const token = e.target.dataset.token;
      const index = e.target.dataset.index;
      const passwordInput = container.querySelector(`[data-index="${index}"] .password-display`);
      const password = passwordStore.get(token) || '';
      
      if (passwordInput.type === 'password') {
        passwordInput.value = password;
        passwordInput.type = 'text';
        e.target.textContent = 'Скрыть';
      } else {
        passwordInput.value = '••••••••';
        passwordInput.type = 'password';
        e.target.textContent = 'Показать';
      }
    });
  });

  container.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const token = btn.getAttribute('data-token');
      const password = passwordStore.get(token) || '';
      const originalText = e.target.textContent;
      const originalBackground = e.target.style.background;
      try {
        await navigator.clipboard.writeText(password);
        e.target.textContent = 'Скопировано';
        e.target.style.background = '#666';
        setTimeout(() => {
          e.target.textContent = originalText;
          e.target.style.background = originalBackground || '';
        }, 2000);
      } catch (err) {
        console.error('Ошибка при копировании:', err);
        alert('Не удалось скопировать пароль. Попробуйте ещё раз.');
      }
    });
  });
  
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      setTimeout(() => {
        const passwordInputs = container.querySelectorAll('.password-display');
        passwordInputs.forEach(input => {
          if (input.type === 'text') {
            input.type = 'password';
          }
        });
      }, 1000);
    }
  });

  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (confirm('Вы уверены, что хотите удалить этот пароль?')) {
        const domain = btn.getAttribute('data-domain') || '';
        const url = btn.getAttribute('data-url') || '';
        const username = btn.getAttribute('data-username') || '';
        
        sendSecureMessage({
          action: 'deletePassword',
          domain: domain,
          url: url,
          username: username
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Ошибка при удалении пароля:', chrome.runtime.lastError);
            alert('Не удалось удалить пароль. Попробуйте ещё раз.');
            return;
          }
          if (response && response.success) {
            loadPasswords();
            loadCurrentSitePasswords();
          } else {
            alert('Не удалось удалить пароль.');
          }
        });
      }
    });
  });
}

function setupSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = allPasswords.filter(item => 
      item.domain.toLowerCase().includes(query) ||
      item.username.toLowerCase().includes(query) ||
      item.url.toLowerCase().includes(query)
    );
    renderPasswords(filtered);
  });
}

function setupEventListeners() {
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  document.getElementById('export-btn').addEventListener('click', () => {
    exportPasswords();
  });

  document.getElementById('clear-all-btn').addEventListener('click', () => {
    if (confirm('Вы уверены, что хотите удалить ВСЕ сохранённые пароли? Это действие нельзя отменить!')) {
      clearAllPasswords();
    }
  });
  
  document.getElementById('pin-modal-submit').addEventListener('click', handlePinSubmit);
  document.getElementById('pin-modal-cancel').addEventListener('click', closePinModal);
  document.getElementById('biometric-auth-btn').addEventListener('click', handleBiometricAuth);
  document.getElementById('pin-modal-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handlePinSubmit();
    }
  });
  
  document.getElementById('pin-modal-input').addEventListener('input', (e) => {
    // Разрешаем цифры и буквы (латиница)
    e.target.value = e.target.value.replace(/[^0-9a-zA-Z]/g, '');
  });
  
  // TOTP обработчики
  document.getElementById('add-totp-btn').addEventListener('click', openAddTotpModal);
  document.getElementById('close-totp-modal').addEventListener('click', closeTotpModal);
  document.getElementById('cancel-totp-btn').addEventListener('click', closeTotpModal);
  document.getElementById('save-totp-btn').addEventListener('click', saveTotp);
  document.getElementById('delete-totp-btn').addEventListener('click', deleteTotp);
  
  document.getElementById('totp-modal').addEventListener('click', (e) => {
    if (e.target.id === 'totp-modal') {
      closeTotpModal();
    }
  });
  
  // Обработчики для модального окна ввода логина
  document.getElementById('close-username-modal').addEventListener('click', closeUsernameModal);
  document.getElementById('save-username-btn').addEventListener('click', handleSaveUsername);
  document.getElementById('save-without-username-btn').addEventListener('click', handleSaveWithoutUsername);
  
  document.getElementById('username-modal').addEventListener('click', (e) => {
    if (e.target.id === 'username-modal') {
      closeUsernameModal(true);
    }
  });
  
  document.getElementById('username-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleSaveUsername();
    }
  });
}

async function checkPinAndLoad() {
  const pinSet = await isPinSet();
  if (!pinSet) {
    const container = document.getElementById('passwords-list');
    container.textContent = '';
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    const emptyDiv1 = document.createElement('div');
    emptyDiv1.textContent = 'PIN-код не установлен';
    const emptyDiv2 = document.createElement('div');
    emptyDiv2.style.marginTop = '12px';
    emptyDiv2.style.fontSize = '12px';
    emptyDiv2.textContent = 'Откройте настройки для первоначальной настройки';
    emptyState.appendChild(emptyDiv1);
    emptyState.appendChild(emptyDiv2);
    container.appendChild(emptyState);
    setEmptyState('current-site-passwords', 'PIN-код не установлен');
    return;
  }
  
  // Проверяем, включена ли биометрия
  // Используем небольшую задержку, чтобы окно было готово
  try {
    const biometricEnabled = await isBiometricEnabled();
    const biometricRegistered = await isBiometricRegistered();
    const biometricSupported = isWebAuthnSupported();
    
    if (biometricEnabled && biometricRegistered && biometricSupported) {
      // Небольшая задержка для обеспечения готовности окна браузера
      // Затем автоматически запускаем биометрическую аутентификацию
      setTimeout(async () => {
        try {
          await attemptBiometricUnlock();
        } catch (error) {
          console.error('Ошибка при автоматической биометрической аутентификации:', error);
          // При ошибке показываем обычное модальное окно
          showPinModal();
        }
      }, 200);
      return;
    }
  } catch (error) {
    console.error('Ошибка при проверке биометрии:', error);
  }
  
  // Если биометрия не доступна, показываем обычное модальное окно PIN
  chrome.runtime.sendMessage({ action: 'getPendingPasswords' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Ошибка при проверке ожидающих паролей:', chrome.runtime.lastError);
      showPinModal();
      return;
    }
    
    if (response && response.passwords && response.passwords.length > 0) {
      const description = document.querySelector('.modal-description');
      if (description) {
        description.textContent = `Требуется для доступа к паролям и сохранения ${response.passwords.length} ожидающих паролей`;
      }
    } else {
      const description = document.querySelector('.modal-description');
      if (description) {
        description.textContent = 'Требуется для доступа к паролям';
      }
    }
    
    showPinModal();
  });
}

async function showPinModal() {
  const modal = document.getElementById('pin-modal');
  modal.style.display = 'flex';
  document.getElementById('pin-modal-input').focus();
  document.getElementById('pin-modal-error').style.display = 'none';
  
  // Проверяем, включена ли биометрия
  try {
    const biometricEnabled = await isBiometricEnabled();
    const biometricRegistered = await isBiometricRegistered();
    const biometricSupported = isWebAuthnSupported();
    
    const biometricContainer = document.getElementById('biometric-button-container');
    if (biometricEnabled && biometricRegistered && biometricSupported) {
      biometricContainer.style.display = 'block';
    } else {
      biometricContainer.style.display = 'none';
    }
  } catch (error) {
    console.error('Ошибка при проверке биометрии:', error);
    document.getElementById('biometric-button-container').style.display = 'none';
  }
}

function closePinModal() {
  const modal = document.getElementById('pin-modal');
  modal.style.display = 'none';
  document.getElementById('pin-modal-input').value = '';
  const description = document.querySelector('.modal-description');
  if (description) {
    description.textContent = 'Требуется для доступа к паролям';
  }
  clearPinFromMemory();
}

async function handlePinSubmit() {
  const pinInput = document.getElementById('pin-modal-input');
  const pin = pinInput.value;
  const errorDiv = document.getElementById('pin-modal-error');
  
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
      const result = await chrome.storage.local.get(['pinAttempts']);
      const attempts = result.pinAttempts || 0;
      const remaining = 5 - attempts;
      
      if (remaining > 0) {
        errorDiv.textContent = `Неверный PIN-код. Осталось попыток: ${remaining}`;
      } else {
        errorDiv.textContent = 'Превышено количество попыток. PIN-код заблокирован на 15 минут.';
      }
      errorDiv.style.display = 'block';
      pinInput.value = '';
      pinInput.focus();
      return;
    }
    
    currentPin = pin;
    
    chrome.runtime.sendMessage({ action: 'setSessionPin', pin: pin }, () => {
      const modal = document.getElementById('pin-modal');
      modal.style.display = 'none';
      document.getElementById('pin-modal-input').value = '';
      document.getElementById('pin-modal-error').style.display = 'none';
      
      savePendingPasswords(pin).then(() => {
        loadPasswordsAfterPin();
        loadCurrentSitePasswords();
      });
    });
  } catch (error) {
    errorDiv.textContent = error.message || 'Ошибка при проверке PIN-кода';
    errorDiv.style.display = 'block';
    pinInput.value = '';
    pinInput.focus();
  }
}

async function attemptBiometricUnlock() {
  try {
    // Проверяем поддержку WebAuthn
    if (!isWebAuthnSupported()) {
      // Если биометрия не поддерживается, показываем обычное модальное окно
      showPinModal();
      return;
    }
    
    // Проверяем, зарегистрирована ли биометрия
    const credentialId = await getBiometricCredentialId();
    if (!credentialId) {
      // Если биометрия не настроена, показываем обычное модальное окно
      showPinModal();
      return;
    }
    
    // Ждем немного, чтобы окно браузера было готово
    // WebAuthn требует активное окно браузера
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Проверяем, что окно активно
    if (document.hidden) {
      // Если окно скрыто, показываем модальное окно
      showPinModal();
      return;
    }
    
    // Выполняем аутентификацию через биометрию
    const authResult = await authenticateBiometric(credentialId);
    
    // Если аутентификация успешна, получаем PIN из хранилища
    const response = await chrome.runtime.sendMessage({ 
      action: 'authenticateWithBiometric',
      assertion: authResult.assertion,
      challenge: authResult.challenge
    });
    
    if (response && response.success) {
      if (response.pin) {
        // PIN получен из зашифрованного хранилища
        currentPin = response.pin;
        
        chrome.runtime.sendMessage({ action: 'setSessionPin', pin: response.pin }, () => {
          savePendingPasswords(response.pin).then(() => {
            loadPasswordsAfterPin();
            loadCurrentSitePasswords();
          });
        });
      } else if (response.requiresPin) {
        // Биометрия подтверждена, но PIN нужно ввести вручную
        // Показываем модальное окно с сообщением
        const description = document.querySelector('.modal-description');
        if (description) {
          description.textContent = 'Биометрия подтверждена. Введите PIN для доступа к данным.';
        }
        showPinModal();
      } else {
        // Неожиданный ответ, показываем обычное модальное окно
        showPinModal();
      }
    } else {
      // Ошибка аутентификации, показываем обычное модальное окно
      showPinModal();
    }
  } catch (error) {
    console.error('Ошибка при автоматической биометрической аутентификации:', error);
    // При ошибке показываем обычное модальное окно
    // Если ошибка связана с отменой пользователем или отсутствием окна, не показываем ошибку
    const errorMessage = error.message || '';
    if (errorMessage.includes('отменена') || 
        errorMessage.includes('NotAllowedError') ||
        errorMessage.includes('Could not find an active browser window') ||
        errorMessage.includes('active browser window')) {
      // Просто показываем модальное окно без сообщения об ошибке
      showPinModal();
    } else {
      // Для других ошибок показываем сообщение
      const errorDiv = document.getElementById('pin-modal-error');
      if (errorDiv) {
        errorDiv.textContent = 'Ошибка при биометрической аутентификации. Введите PIN вручную.';
        errorDiv.style.display = 'block';
      }
      showPinModal();
    }
  }
}

async function handleBiometricAuth() {
  const errorDiv = document.getElementById('pin-modal-error');
  const biometricBtn = document.getElementById('biometric-auth-btn');
  
  errorDiv.style.display = 'none';
  
  try {
    // Проверяем поддержку WebAuthn
    if (!isWebAuthnSupported()) {
      errorDiv.textContent = 'Биометрическая аутентификация не поддерживается в вашем браузере';
      errorDiv.style.display = 'block';
      return;
    }
    
    // Проверяем, зарегистрирована ли биометрия
    const credentialId = await getBiometricCredentialId();
    if (!credentialId) {
      errorDiv.textContent = 'Биометрическая аутентификация не настроена. Настройте её в настройках расширения.';
      errorDiv.style.display = 'block';
      return;
    }
    
    // Отключаем кнопку во время аутентификации
    if (biometricBtn) {
      biometricBtn.disabled = true;
      biometricBtn.textContent = '⏳ Аутентификация...';
    }
    
    // Выполняем аутентификацию через биометрию
    const authResult = await authenticateBiometric(credentialId);
    
    // Если аутентификация успешна, получаем PIN из хранилища
    const response = await chrome.runtime.sendMessage({ 
      action: 'authenticateWithBiometric',
      assertion: authResult.assertion,
      challenge: authResult.challenge
    });
    
    if (response && response.success) {
      if (response.pin) {
        // PIN получен из зашифрованного хранилища
        currentPin = response.pin;
        
        chrome.runtime.sendMessage({ action: 'setSessionPin', pin: response.pin }, () => {
          const modal = document.getElementById('pin-modal');
          modal.style.display = 'none';
          document.getElementById('pin-modal-input').value = '';
          document.getElementById('pin-modal-error').style.display = 'none';
          
          savePendingPasswords(response.pin).then(() => {
            loadPasswordsAfterPin();
            loadCurrentSitePasswords();
          });
        });
      } else if (response.requiresPin) {
        // Биометрия подтверждена, но PIN нужно ввести вручную
        errorDiv.textContent = 'Биометрия подтверждена. Введите PIN для доступа к данным.';
        errorDiv.style.display = 'block';
        document.getElementById('pin-modal-input').focus();
      } else {
        throw new Error('Неожиданный ответ от сервера');
      }
    } else {
      throw new Error(response?.error || 'Ошибка при аутентификации');
    }
  } catch (error) {
    console.error('Ошибка при биометрической аутентификации:', error);
    errorDiv.textContent = error.message || 'Ошибка при биометрической аутентификации';
    errorDiv.style.display = 'block';
  } finally {
    if (biometricBtn) {
      biometricBtn.disabled = false;
      biometricBtn.textContent = '🔐 Разблокировать через биометрию';
    }
  }
}

let currentPendingPassword = null;
let pendingPasswordsQueue = [];
let pendingPasswordsResolve = null;

function showUsernameModal(pendingPassword) {
  currentPendingPassword = pendingPassword;
  document.getElementById('username-modal-domain').textContent = pendingPassword.domain;
  document.getElementById('username-input').value = '';
  document.getElementById('username-modal-error').style.display = 'none';
  document.getElementById('username-modal').style.display = 'flex';
  setTimeout(() => {
    document.getElementById('username-input').focus();
  }, 100);
}

function closeUsernameModal(skipPassword = false) {
  // Если модальное окно закрыто без сохранения, пропускаем этот пароль
  if (skipPassword && currentPendingPassword && pendingPasswordsResolve) {
    console.log('Модальное окно закрыто без сохранения, пропускаем пароль');
    const passwordToSkip = currentPendingPassword;
    currentPendingPassword = null;
    document.getElementById('username-modal').style.display = 'none';
    processNextPendingPassword(false);
    return;
  }
  document.getElementById('username-modal').style.display = 'none';
  currentPendingPassword = null;
}

function handleSaveUsername() {
  const username = document.getElementById('username-input').value.trim();
  const errorDiv = document.getElementById('username-modal-error');
  
  errorDiv.style.display = 'none';
  
  if (currentPendingPassword) {
    savePasswordWithUsername(currentPendingPassword, username);
  }
  closeUsernameModal();
}

function handleSaveWithoutUsername() {
  if (currentPendingPassword) {
    savePasswordWithUsername(currentPendingPassword, '');
  }
  closeUsernameModal();
}

function savePasswordWithUsername(pendingPassword, username) {
  if (!pendingPasswordsResolve) return;
  
  chrome.runtime.sendMessage({
    action: 'savePassword',
    domain: pendingPassword.domain,
    url: pendingPassword.url,
    username: username || '',
    password: pendingPassword.password
  }, (saveResponse) => {
    if (chrome.runtime.lastError) {
      console.error('Ошибка при отправке сообщения savePassword:', chrome.runtime.lastError);
      processNextPendingPassword(false);
      return;
    }
    
    if (saveResponse && saveResponse.success) {
      console.log(`Пароль успешно сохранён для ${pendingPassword.domain}, логин: ${username || '(без логина)'}`);
      processNextPendingPassword(true);
    } else {
      console.error('Ошибка при сохранении пароля:', saveResponse?.error);
      processNextPendingPassword(false);
    }
  });
}

function processNextPendingPassword(success) {
  if (!pendingPasswordsResolve) return;
  
  // Учитываем результат предыдущего сохранения (если был)
  if (success !== undefined) {
    if (success) {
      pendingPasswordsQueue.savedCount = (pendingPasswordsQueue.savedCount || 0) + 1;
    } else {
      pendingPasswordsQueue.failedCount = (pendingPasswordsQueue.failedCount || 0) + 1;
    }
  }
  
  if (pendingPasswordsQueue.currentIndex >= pendingPasswordsQueue.passwords.length) {
    // Все пароли обработаны
    console.log(`Сохранение завершено: успешно ${pendingPasswordsQueue.savedCount || 0}, ошибок ${pendingPasswordsQueue.failedCount || 0}`);
    chrome.runtime.sendMessage({ action: 'clearPendingPasswords' }, () => {});
    
    if (pendingPasswordsQueue.savedCount > 0) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Пароли сохранены',
        message: `Успешно сохранено паролей: ${pendingPasswordsQueue.savedCount}`
      }).catch(() => {});
    }
    
    if (pendingPasswordsQueue.failedCount > 0) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Ошибка сохранения',
        message: `Не удалось сохранить ${pendingPasswordsQueue.failedCount} паролей`
      }).catch(() => {});
    }
    
    loadPasswordsAfterPin();
    loadCurrentSitePasswords();
    pendingPasswordsResolve();
    pendingPasswordsResolve = null;
    pendingPasswordsQueue = [];
    return;
  }
  
  // Обрабатываем следующий пароль
  const pendingPassword = pendingPasswordsQueue.passwords[pendingPasswordsQueue.currentIndex];
  pendingPasswordsQueue.currentIndex++;
  
  // Проверяем, нужен ли логин
  const needsUsername = !pendingPassword.username || 
                        pendingPassword.username === 'unknown' || 
                        pendingPassword.username.trim() === '';
  
  if (needsUsername) {
    // Показываем модальное окно для ввода логина
    showUsernameModal(pendingPassword);
  } else {
    // Сохраняем сразу с существующим логином
    savePasswordWithUsername(pendingPassword, pendingPassword.username);
  }
}

async function savePendingPasswords(pin) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getPendingPasswords' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Ошибка при получении ожидающих паролей:', chrome.runtime.lastError);
        resolve();
        return;
      }
      
      if (!response || !response.passwords || response.passwords.length === 0) {
        console.log('Нет ожидающих паролей для сохранения');
        resolve();
        return;
      }
      
      const pendingPasswords = response.passwords;
      console.log(`Найдено ${pendingPasswords.length} ожидающих паролей для сохранения`);
      
      chrome.runtime.sendMessage({ action: 'setSessionPin', pin: pin }, (pinResponse) => {
        if (chrome.runtime.lastError) {
          console.error('Ошибка при установке PIN в сессию:', chrome.runtime.lastError);
          resolve();
          return;
        }
        
        if (!pinResponse || !pinResponse.success) {
          console.error('Не удалось установить PIN в сессию:', pinResponse);
          resolve();
          return;
        }
        
        console.log('PIN установлен в сессию, начинаем сохранение паролей');
        
        // Инициализируем очередь
        pendingPasswordsQueue = {
          passwords: pendingPasswords,
          currentIndex: 0,
          savedCount: 0,
          failedCount: 0
        };
        pendingPasswordsResolve = resolve;
        
        // Начинаем обработку первого пароля
        processNextPendingPassword();
      });
    });
  });
}

async function exportPasswords() {
  if (!currentPin) {
    alert('Требуется PIN-код для экспорта паролей');
    showPinModal();
    return;
  }
  
  if (allPasswords.length === 0) {
    alert('Нет паролей для экспорта');
    return;
  }
  
  try {
    const encryptedData = await encryptExportData(allPasswords, currentPin);
    
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
    
    clearPinFromMemory();
  } catch (error) {
    console.error('Ошибка при экспорте паролей:', error);
    alert('Ошибка при экспорте паролей: ' + error.message);
  }
}

function clearAllPasswords() {
  chrome.storage.local.set({ passwords: {} }, () => {
    allPasswords = [];
    renderPasswords([]);
    setEmptyState('current-site-passwords', 'Нет сохранённых паролей для этого сайта');
  });
}

// TOTP функции
async function loadTotpCodes() {
  const container = document.getElementById('totp-list');
  container.innerHTML = '<div class="loading">Загрузка...</div>';
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAllTotp' });
    if (chrome.runtime.lastError) {
      console.error('Ошибка при загрузке TOTP:', chrome.runtime.lastError);
      setEmptyState('totp-list', 'Ошибка загрузки 2FA кодов');
      return;
    }
    
    if (response && response.totpList) {
      renderTotpCodes(response.totpList);
    } else {
      setEmptyState('totp-list', 'Нет сохранённых 2FA кодов');
    }
  } catch (error) {
    console.error('Ошибка при загрузке TOTP:', error);
    setEmptyState('totp-list', 'Ошибка загрузки 2FA кодов');
  }
}

async function renderTotpCodes(totpList) {
  const container = document.getElementById('totp-list');
  container.innerHTML = '';
  
  if (!totpList || totpList.length === 0) {
    setEmptyState('totp-list', 'Нет сохранённых 2FA кодов');
    return;
  }
  
  for (let i = 0; i < totpList.length; i++) {
    const totp = totpList[i];
    const totpItem = document.createElement('div');
    totpItem.className = 'totp-item';
    totpItem.setAttribute('data-index', i.toString());
    
    try {
      const code = await generateTOTP(totp.secret);
      const timeRemaining = getTimeRemaining();
      
      totpItem.innerHTML = `
        <div class="totp-header-info">
          <div>
            <div class="totp-service">${escapeHtml(totp.service || 'Без названия')}</div>
            <div class="totp-login">${escapeHtml(totp.login || '')}</div>
          </div>
        </div>
        <div class="totp-code-row">
          <div class="totp-code" data-index="${i}">${code}</div>
        </div>
        <div class="totp-time" data-index="${i}">Обновится через ${timeRemaining}с</div>
        <div class="totp-actions">
          <button class="totp-copy-btn" data-index="${i}" data-code="${code}">Копировать</button>
          <button class="totp-edit-btn" data-index="${i}">Редактировать</button>
          <button class="totp-delete-btn" data-index="${i}">Удалить</button>
        </div>
      `;
      
      container.appendChild(totpItem);
    } catch (error) {
      console.error('Ошибка при генерации TOTP для', totp.service, error);
      totpItem.innerHTML = `
        <div class="totp-header-info">
          <div>
            <div class="totp-service">${escapeHtml(totp.service || 'Без названия')}</div>
            <div class="totp-login">${escapeHtml(totp.login || '')}</div>
          </div>
        </div>
        <div class="error-message">Ошибка генерации кода</div>
        <div class="totp-actions">
          <button class="totp-edit-btn" data-index="${i}">Редактировать</button>
          <button class="totp-delete-btn" data-index="${i}">Удалить</button>
        </div>
      `;
      container.appendChild(totpItem);
    }
  }
  
  // Обработчики событий
  container.querySelectorAll('.totp-copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const code = e.target.getAttribute('data-code');
      try {
        await navigator.clipboard.writeText(code);
        const originalText = e.target.textContent;
        e.target.textContent = 'Скопировано';
        e.target.style.background = '#3c3';
        setTimeout(() => {
          e.target.textContent = originalText;
          e.target.style.background = '';
        }, 2000);
      } catch (err) {
        console.error('Ошибка при копировании:', err);
        alert('Не удалось скопировать код. Попробуйте ещё раз.');
      }
    });
  });
  
  container.querySelectorAll('.totp-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      editTotp(index);
    });
  });
  
  container.querySelectorAll('.totp-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      if (confirm('Вы уверены, что хотите удалить этот 2FA код?')) {
        await deleteTotpById(index);
      }
    });
  });
}

function startTotpUpdate() {
  stopTotpUpdate();
  totpUpdateInterval = setInterval(async () => {
    const container = document.getElementById('totp-list');
    if (!container) {
      stopTotpUpdate();
      return;
    }
    
    const totpItems = container.querySelectorAll('.totp-item');
    if (totpItems.length === 0) {
      return;
    }
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getAllTotp' });
      if (response && response.totpList) {
        for (let i = 0; i < response.totpList.length; i++) {
          const totp = response.totpList[i];
          const codeElement = container.querySelector(`.totp-code[data-index="${i}"]`);
          const timeElement = container.querySelector(`.totp-time[data-index="${i}"]`);
          const copyBtn = container.querySelector(`.totp-copy-btn[data-index="${i}"]`);
          
          if (codeElement) {
            try {
              const code = await generateTOTP(totp.secret);
              codeElement.textContent = code;
              if (copyBtn) {
                copyBtn.setAttribute('data-code', code);
              }
            } catch (error) {
              console.error('Ошибка при обновлении TOTP:', error);
            }
          }
          
          if (timeElement) {
            const timeRemaining = getTimeRemaining();
            timeElement.textContent = `Обновится через ${timeRemaining}с`;
          }
        }
      }
    } catch (error) {
      console.error('Ошибка при обновлении TOTP кодов:', error);
    }
  }, 1000);
}

function stopTotpUpdate() {
  if (totpUpdateInterval) {
    clearInterval(totpUpdateInterval);
    totpUpdateInterval = null;
  }
}

function openAddTotpModal() {
  editingTotpIndex = null;
  document.getElementById('totp-modal-title').textContent = 'Добавить 2FA';
  document.getElementById('delete-totp-btn').style.display = 'none';
  
  document.getElementById('totp-service').value = '';
  document.getElementById('totp-login').value = '';
  document.getElementById('totp-secret').value = '';
  
  document.getElementById('totp-error').style.display = 'none';
  document.getElementById('totp-success').style.display = 'none';
  
  document.getElementById('totp-modal').style.display = 'flex';
}

function editTotp(index) {
  editingTotpIndex = index;
  document.getElementById('totp-modal-title').textContent = 'Редактировать 2FA';
  document.getElementById('delete-totp-btn').style.display = 'block';
  
  chrome.runtime.sendMessage({ action: 'getAllTotp' }, (response) => {
    if (response && response.totpList && response.totpList[index]) {
      const totp = response.totpList[index];
      document.getElementById('totp-service').value = totp.service || '';
      document.getElementById('totp-login').value = totp.login || '';
      document.getElementById('totp-secret').value = totp.secret || '';
      
      document.getElementById('totp-error').style.display = 'none';
      document.getElementById('totp-success').style.display = 'none';
      
      document.getElementById('totp-modal').style.display = 'flex';
    }
  });
}

function closeTotpModal() {
  document.getElementById('totp-modal').style.display = 'none';
  editingTotpIndex = null;
  document.getElementById('totp-service').value = '';
  document.getElementById('totp-login').value = '';
  document.getElementById('totp-secret').value = '';
}

async function saveTotp() {
  const service = document.getElementById('totp-service').value.trim();
  const login = document.getElementById('totp-login').value.trim();
  const secret = document.getElementById('totp-secret').value.trim();
  const errorDiv = document.getElementById('totp-error');
  const successDiv = document.getElementById('totp-success');
  
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
        closeTotpModal();
        await loadTotpCodes();
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

async function deleteTotp() {
  if (editingTotpIndex === null) return;
  
  if (confirm('Вы уверены, что хотите удалить этот 2FA код?')) {
    await deleteTotpById(editingTotpIndex);
    closeTotpModal();
  }
}

async function deleteTotpById(index) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteTotp',
      index: index
    });
    
    if (response && response.success) {
      await loadTotpCodes();
    } else {
      alert('Не удалось удалить 2FA код');
    }
  } catch (error) {
    console.error('Ошибка при удалении TOTP:', error);
    alert('Ошибка при удалении 2FA кода');
  }
}

window.addEventListener('beforeunload', () => {
  stopTotpUpdate();
  clearPinFromMemory();
  clearPasswordsFromDOM();
  passwordStore.clear();
});

