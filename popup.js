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
      
      if (tabName === 'current') {
        loadCurrentSitePasswords();
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
    usernameDiv.textContent = item.username || '';
    
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
  document.getElementById('pin-modal-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handlePinSubmit();
    }
  });
  
  document.getElementById('pin-modal-input').addEventListener('input', (e) => {
    // Разрешаем цифры и буквы (латиница)
    e.target.value = e.target.value.replace(/[^0-9a-zA-Z]/g, '');
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

function showPinModal() {
  const modal = document.getElementById('pin-modal');
  modal.style.display = 'flex';
  document.getElementById('pin-modal-input').focus();
  document.getElementById('pin-modal-error').style.display = 'none';
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
        
        let savedCount = 0;
        let failedCount = 0;
        let currentIndex = 0;
        
        function saveNextPassword() {
          if (currentIndex >= pendingPasswords.length) {
            console.log(`Сохранение завершено: успешно ${savedCount}, ошибок ${failedCount}`);
            chrome.runtime.sendMessage({ action: 'clearPendingPasswords' }, () => {});
            
            if (savedCount > 0) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Пароли сохранены',
                message: `Успешно сохранено паролей: ${savedCount}`
              }).catch(() => {});
            }
            
            if (failedCount > 0) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Ошибка сохранения',
                message: `Не удалось сохранить ${failedCount} паролей`
              }).catch(() => {});
            }
            
            loadPasswordsAfterPin();
            loadCurrentSitePasswords();
            resolve();
            return;
          }
          
          const pendingPassword = pendingPasswords[currentIndex];
          currentIndex++;
          
          console.log(`Сохранение пароля для ${pendingPassword.domain}, пользователь: ${pendingPassword.username}`);
          
          chrome.runtime.sendMessage({
            action: 'savePassword',
            domain: pendingPassword.domain,
            url: pendingPassword.url,
            username: pendingPassword.username,
            password: pendingPassword.password
          }, (saveResponse) => {
            if (chrome.runtime.lastError) {
              console.error('Ошибка при отправке сообщения savePassword:', chrome.runtime.lastError);
              failedCount++;
              saveNextPassword();
              return;
            }
            
            if (saveResponse && saveResponse.success) {
              savedCount++;
              console.log(`Пароль успешно сохранён для ${pendingPassword.domain}`);
            } else {
              failedCount++;
              console.error('Ошибка при сохранении пароля:', saveResponse?.error);
            }
            
            saveNextPassword();
          });
        }
        
        saveNextPassword();
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

