(function() {
  'use strict';
  
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
    console.error('[TOTC Pass | Password Pass] Chrome API недоступен. Расширение не может работать.');
    return;
  }
  
  // Генерация nonce для защиты от реплей-атак
  function generateNonce() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${crypto.getRandomValues(new Uint8Array(4)).join('')}`;
  }
  
  // Обертка для отправки сообщений с nonce и timestamp
  function sendSecureMessage(message, callback) {
    message.timestamp = Date.now();
    message.nonce = generateNonce();
    chrome.runtime.sendMessage(message, callback);
  }

  function isLoginForm(form) {
    const pinModal = document.getElementById('password-manager-pin-modal');
    if (pinModal && (pinModal === form || pinModal.contains(form))) {
      return false;
    }
    
    const hasPasswordField = form.querySelector('input[type="password"]:not([data-password-manager-pin-input]):not(#password-manager-pin-input)');
    if (!hasPasswordField) return false;
    
    if (isPinModalField(hasPasswordField)) {
      return false;
    }
    
    const formText = form.innerHTML.toLowerCase();
    const formAction = (form.action || '').toLowerCase();
    const formId = (form.id || '').toLowerCase();
    const formClass = (form.className || '').toLowerCase();
    
    const loginKeywords = ['login', 'signin', 'sign-in', 'auth', 'password', 'log-in', 'signup', 'register'];
    
    const hasLoginKeywords = loginKeywords.some(keyword => 
      formText.includes(keyword) || 
      formAction.includes(keyword) || 
      formId.includes(keyword) ||
      formClass.includes(keyword)
    );
    
    return hasLoginKeywords || hasPasswordField !== null;
  }

  function findPasswordFields(container) {
    const pinModal = document.getElementById('password-manager-pin-modal');
    if (pinModal && (pinModal === container || pinModal.contains(container))) {
      return null;
    }
    
    const passwordField = container.querySelector('input[type="password"]:not([data-password-manager-pin-input]):not(#password-manager-pin-input)');
    if (!passwordField) return null;
    
    if (isPinModalField(passwordField)) {
      return null;
    }

    const usernameField = container.querySelector('input[type="email"]') ||
                         container.querySelector('input[type="text"][name*="user" i]') ||
                         container.querySelector('input[type="text"][name*="email" i]') ||
                         container.querySelector('input[type="text"][name*="login" i]') ||
                         container.querySelector('input[name*="username" i]') ||
                         container.querySelector('input[id*="user" i]') ||
                         container.querySelector('input[id*="email" i]') ||
                         container.querySelector('input[id*="login" i]') ||
                         container.querySelector('input[type="text"]:not([type="password"])') ||
                         container.querySelector('input[autocomplete="username"]') ||
                         container.querySelector('input[autocomplete="email"]') ||
                         (() => {
                           const allInputs = Array.from(container.querySelectorAll('input'));
                           const passwordIndex = allInputs.indexOf(passwordField);
                           return allInputs.slice(0, passwordIndex).reverse()
                             .find(input => input.type === 'text' || input.type === 'email' || !input.type);
                         })();

    return {
      username: usernameField,
      password: passwordField,
      form: container.tagName === 'FORM' ? container : passwordField.closest('form') || container
    };
  }

  async function checkWhitelist(domain) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve(false);
        return;
      }
      
      chrome.runtime.sendMessage({
        action: 'checkWhitelist',
        domain: domain
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(response && response.whitelisted === true);
      });
    });
  }

  function isPinModalField(field) {
    if (!field) return false;
    if (field.hasAttribute('data-password-manager-pin-input')) {
      return true;
    }
    if (field.id === 'password-manager-pin-input') {
      return true;
    }
    const pinModal = document.getElementById('password-manager-pin-modal');
    if (!pinModal) return false;
    return pinModal.contains(field);
  }

  async function savePasswordFromFields(passwordField, usernameField = null) {
    if (!passwordField) return;
    
    if (isPinModalField(passwordField) || isPinModalField(usernameField)) {
      return;
    }
    
    const username = usernameField ? usernameField.value.trim() : '';
    const password = passwordField.value.trim();

    if (password && password.length > 0) {
      const domain = window.location.hostname;
      const isWhitelisted = await checkWhitelist(domain);
      if (isWhitelisted) {
        return;
      }
      
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'savePendingPassword',
          domain: domain,
          url: window.location.href,
          username: username || 'unknown',
          password: password
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[TOTC Pass | Password Pass] Ошибка при сохранении ожидающего пароля:', chrome.runtime.lastError);
            return;
          }
          if (response && response.success) {
            chrome.runtime.sendMessage({ action: 'openPopup' }, () => {});
            chrome.runtime.sendMessage({
              action: 'showNotification',
              title: 'Требуется PIN-код',
              message: 'Откройте попап расширения и введите PIN-код для сохранения пароля'
            }, () => {});
          }
        });
      } else {
        console.error('[TOTC Pass | Password Pass] Chrome API недоступен для сохранения пароля');
      }
    }
  }

  async function handleFormSubmit(event) {
    const form = event.target;
    
    if (!isLoginForm(form)) {
      return;
    }

    const fields = findPasswordFields(form);
    if (!fields || !fields.password) {
      return;
    }

    await savePasswordFromFields(fields.password, fields.username);
  }

  function showPinModalOnPage(callback) {
    const oldModal = document.getElementById('password-manager-pin-modal');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = 'password-manager-pin-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 32px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    `;

    const title = document.createElement('h2');
    title.textContent = 'Введите PIN-код';
    title.style.cssText = 'font-size: 24px; font-weight: 600; color: #333; margin-bottom: 8px; text-align: center;';

    const description = document.createElement('p');
    description.textContent = 'Требуется для заполнения формы';
    description.style.cssText = 'text-align: center; color: #666; font-size: 14px; margin-bottom: 24px;';

    const pinInput = document.createElement('input');
    pinInput.type = 'password';
    pinInput.maxLength = 12;
    pinInput.placeholder = '••••••';
    pinInput.setAttribute('data-password-manager-pin-input', 'true');
    pinInput.id = 'password-manager-pin-input';
    pinInput.name = 'password-manager-pin-input';
    pinInput.style.cssText = `
      width: 100%;
      padding: 16px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 24px;
      text-align: center;
      letter-spacing: 12px;
      font-family: 'Courier New', monospace;
      margin-bottom: 16px;
      box-sizing: border-box;
    `;

    const errorDiv = document.createElement('div');
    errorDiv.id = 'pin-modal-error';
    errorDiv.style.cssText = `
      background: #fee;
      color: #c33;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;
      border: 1px solid #fcc;
      text-align: center;
      display: none;
    `;

    const buttonsDiv = document.createElement('div');
    buttonsDiv.style.cssText = 'display: flex; gap: 12px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Отмена';
    cancelBtn.style.cssText = `
      flex: 1;
      padding: 12px;
      background: #f0f0f0;
      color: #333;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    `;
    cancelBtn.onmouseover = () => cancelBtn.style.background = '#e0e0e0';
    cancelBtn.onmouseout = () => cancelBtn.style.background = '#f0f0f0';

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Подтвердить';
    submitBtn.style.cssText = `
      flex: 1;
      padding: 12px;
      background: #333;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    `;
    submitBtn.onmouseover = () => submitBtn.style.background = '#444';
    submitBtn.onmouseout = () => submitBtn.style.background = '#333';

    pinInput.addEventListener('input', (e) => {
      // Разрешаем цифры и буквы
      e.target.value = e.target.value.replace(/[^0-9a-zA-Z]/g, '');
    });

    const handleSubmit = async () => {
      const pin = pinInput.value;
      
      if (!pin || pin.length < 6 || pin.length > 12) {
        errorDiv.textContent = 'PIN-код должен содержать от 6 до 12 символов (цифры и буквы)';
        errorDiv.style.display = 'block';
        return;
      }
      
      // Проверка сложности PIN
      const hasDigit = /[0-9]/.test(pin);
      const hasLetter = /[a-zA-Z]/.test(pin);
      if (!hasDigit || !hasLetter) {
        errorDiv.textContent = 'PIN-код должен содержать хотя бы одну цифру и одну букву';
        errorDiv.style.display = 'block';
        return;
      }

      chrome.runtime.sendMessage({
        action: 'verifyAndSetPin',
        pin: pin
      }, (response) => {
        if (chrome.runtime.lastError) {
          errorDiv.textContent = 'Ошибка при проверке PIN-кода: ' + chrome.runtime.lastError.message;
          errorDiv.style.display = 'block';
          return;
        }

        if (response && response.success) {
          modal.remove();
          if (callback) callback(true);
        } else {
          const errorMessage = response?.error || 'Неверный PIN-код';
          errorDiv.textContent = errorMessage;
          errorDiv.style.display = 'block';
          pinInput.value = '';
          pinInput.focus();
        }
      });
    };

    submitBtn.addEventListener('click', handleSubmit);
    pinInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSubmit();
      }
    });

    cancelBtn.addEventListener('click', () => {
      modal.remove();
      if (callback) callback(null);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
        if (callback) callback(null);
      }
    });

    buttonsDiv.appendChild(cancelBtn);
    buttonsDiv.appendChild(submitBtn);

    modalContent.appendChild(title);
    modalContent.appendChild(description);
    modalContent.appendChild(pinInput);
    modalContent.appendChild(errorDiv);
    modalContent.appendChild(buttonsDiv);

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    setTimeout(() => pinInput.focus(), 100);
  }

  async function autofillForm(form, callback) {
    const fields = findPasswordFields(form);
    
    if (!fields || !fields.password) {
      if (callback) callback({ success: false, message: 'Не найдены поля формы входа на странице' });
      return;
    }

    const domain = window.location.hostname;
    
    const isWhitelisted = await checkWhitelist(domain);
    if (isWhitelisted) {
      if (callback) callback({ success: false, message: 'Этот сайт находится в белом списке' });
      return;
    }
    
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      if (callback) callback({ success: false, message: 'Chrome API недоступен. Перезагрузите страницу.' });
      return;
    }
    
    showPinModalOnPage(async (pinEntered) => {
      if (!pinEntered) {
        if (callback) callback({ success: false, message: 'PIN-код не введён' });
        return;
      }
      await performAutofill(domain, fields, callback);
    });
  }

  async function performAutofill(domain, fields, callback) {
    sendSecureMessage({
      action: 'getPasswords',
      domain: domain
    }, (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || 'Неизвестная ошибка';
        console.error('[TOTC Pass | Password Pass] Ошибка при получении паролей:', errorMsg);
        // Очищаем PIN только при ошибке
        chrome.runtime.sendMessage({ action: 'clearSessionPin' }, () => {});
        if (callback) callback({ success: false, message: 'Ошибка при получении паролей: ' + errorMsg });
        return;
      }
      
      console.log('[TOTC Pass | Password Pass] Получены пароли:', response?.passwords?.length || 0);
      
      if (response && response.passwords && response.passwords.length > 0) {
        if (response.passwords.length === 1) {
          const savedPassword = response.passwords[0];
          
          if (fields.username) {
            fields.username.value = savedPassword.username;
            fields.username.dispatchEvent(new Event('input', { bubbles: true }));
            fields.username.dispatchEvent(new Event('change', { bubbles: true }));
          }
          
          fields.password.value = savedPassword.password;
          fields.password.dispatchEvent(new Event('input', { bubbles: true }));
          fields.password.dispatchEvent(new Event('change', { bubbles: true }));
          
          setTimeout(() => {
            fields.password.focus();
            fields.password.blur();
            // Очищаем PIN после успешного заполнения формы
            chrome.runtime.sendMessage({ action: 'clearSessionPin' }, () => {});
          }, 100);
          
          if (callback) callback({ 
            success: true, 
            message: `Форма заполнена для пользователя: ${savedPassword.username}` 
          });
        } else {
          showPasswordMenu(fields, response.passwords);
          setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'clearSessionPin' }, () => {});
          }, 5000);
          if (callback) callback({ 
            success: true, 
            message: `Выберите аккаунт из меню (найдено ${response.passwords.length} паролей)` 
          });
        }
      } else if (response && response.error && response.error.includes('PIN')) {
        chrome.runtime.sendMessage({ action: 'clearSessionPin' }, () => {});
        if (callback) callback({ 
          success: false, 
          message: 'Требуется PIN-код. Откройте popup расширения и введите PIN-код.' 
        });
      } else {
        chrome.runtime.sendMessage({ action: 'clearSessionPin' }, () => {});
        if (callback) callback({ 
          success: false, 
          message: 'Не найдено сохранённых паролей для этого сайта. Сохраните пароль, войдя на сайт.' 
        });
      }
    });
  }
  
  function fillAllForms(callback) {
    const passwordFields = document.querySelectorAll('input[type="password"]:not([data-password-manager-pin-input]):not(#password-manager-pin-input)');
    
    if (passwordFields.length === 0) {
      if (callback) callback({ success: false, message: 'На странице не найдено форм входа' });
      return;
    }
    
    const containers = new Set();
    passwordFields.forEach((passwordField) => {
      const form = passwordField.closest('form');
      if (form) {
        containers.add(form);
      } else {
        let container = passwordField.closest('div[class*="form" i], div[class*="login" i], div[class*="auth" i], div[id*="form" i], div[id*="login" i], div[id*="auth" i]');
        
        if (!container) {
          container = passwordField.parentElement;
        }
        
        if (!container || container === document.body) {
          container = document.body;
        }
        
        containers.add(container);
      }
    });
    
    const containersArray = Array.from(containers);
    
    if (containersArray.length === 0) {
      if (callback) callback({ success: false, message: 'Не найдено контейнеров с формами входа' });
      return;
    }
    
    const firstContainer = containersArray[0];
    
    autofillForm(firstContainer, (result) => {
      if (callback) callback(result);
    });
  }

  function showPasswordMenu(fields, passwords) {
    const oldMenu = document.getElementById('password-manager-menu');
    if (oldMenu) oldMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'password-manager-menu';
    menu.style.cssText = `
      position: fixed;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 10000;
      padding: 8px;
      max-width: 300px;
      font-family: Arial, sans-serif;
      font-size: 14px;
    `;

    const title = document.createElement('div');
    title.textContent = 'Выберите аккаунт:';
    title.style.cssText = 'font-weight: bold; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #eee;';
    menu.appendChild(title);

    passwords.forEach((savedPassword, index) => {
      const item = document.createElement('div');
      item.textContent = savedPassword.username;
      item.style.cssText = `
        padding: 8px;
        cursor: pointer;
        border-radius: 2px;
      `;
      item.onmouseover = () => item.style.background = '#f0f0f0';
      item.onmouseout = () => item.style.background = 'transparent';
      item.onclick = () => {
        fields.username.value = savedPassword.username;
        fields.password.value = savedPassword.password;
        fields.username.dispatchEvent(new Event('input', { bubbles: true }));
        fields.password.dispatchEvent(new Event('input', { bubbles: true }));
        menu.remove();
      };
      menu.appendChild(item);
    });

    const rect = fields.password.getBoundingClientRect();
    menu.style.top = (rect.bottom + window.scrollY + 5) + 'px';
    menu.style.left = (rect.left + window.scrollX) + 'px';

    document.body.appendChild(menu);

    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && e.target !== fields.password) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 100);
  }

  const passwordCache = new WeakMap();
  let cacheEncryptionKey = null;
  
  async function getCacheEncryptionKey() {
    if (!cacheEncryptionKey) {
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      cacheEncryptionKey = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return cacheEncryptionKey;
  }
  
  async function encryptCacheData(data, key) {
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    const keyBytes = encoder.encode(key);
    const encrypted = new Uint8Array(dataBytes.length);
    for (let i = 0; i < dataBytes.length; i++) {
      encrypted[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return Array.from(encrypted).map(b => String.fromCharCode(b)).join('');
  }
  
  async function decryptCacheData(encrypted, key) {
    const encryptedBytes = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
      encryptedBytes[i] = encrypted.charCodeAt(i);
    }
    const keyBytes = new TextEncoder().encode(key);
    const decrypted = new Uint8Array(encryptedBytes.length);
    for (let i = 0; i < encryptedBytes.length; i++) {
      decrypted[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return new TextDecoder().decode(decrypted);
  }

  async function savePasswordFromCache(form) {
    const cached = passwordCache.get(form);
    if (!cached) return;
    
    const fields = findPasswordFields(form);
    if (!fields || !fields.password) return;
    
    const cacheKey = await getCacheEncryptionKey();
    let username = 'unknown';
    let password = '';
    
    try {
      if (cached.encryptedUsername) {
        username = await decryptCacheData(cached.encryptedUsername, cacheKey);
      } else {
        username = fields.username ? fields.username.value.trim() : 'unknown';
      }
      
      if (cached.encryptedPassword) {
        password = await decryptCacheData(cached.encryptedPassword, cacheKey);
      } else {
        password = fields.password.value.trim();
      }
    } catch (error) {
      username = fields.username ? fields.username.value.trim() : 'unknown';
      password = fields.password.value.trim();
    }
    
    if (password && password.length > 0) {
      const domain = window.location.hostname;
      const isWhitelisted = await checkWhitelist(domain);
      if (isWhitelisted) {
        return;
      }
      
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        sendSecureMessage({
          action: 'savePendingPassword',
          domain: domain,
          url: window.location.href,
          username: username || 'unknown',
          password: password
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[TOTC Pass | Password Pass] Ошибка при сохранении ожидающего пароля:', chrome.runtime.lastError);
            return;
          }
          if (response && response.success) {
            passwordCache.delete(form);
            chrome.runtime.sendMessage({ action: 'openPopup' }, () => {});
            chrome.runtime.sendMessage({
              action: 'showNotification',
              title: 'Требуется PIN-код',
              message: 'Откройте попап расширения и введите PIN-код для сохранения пароля'
            }, () => {});
          }
        });
      } else {
        console.error('[TOTC Pass | Password Pass] Chrome API недоступен для сохранения пароля из кэша');
      }
    }
  }

  function trackPasswordChanges(form) {
    const fields = findPasswordFields(form);
    if (!fields || !fields.password) return;
    
    const savePasswordValue = async () => {
      const username = fields.username ? fields.username.value.trim() : '';
      const password = fields.password.value.trim();
      
      if (password && password.length > 0) {
        const cacheKey = await getCacheEncryptionKey();
        const encryptedUsername = await encryptCacheData(username || 'unknown', cacheKey);
        const encryptedPassword = await encryptCacheData(password, cacheKey);
        passwordCache.set(form, { 
          encryptedUsername, 
          encryptedPassword 
        });
      }
    };
    
    fields.password.addEventListener('input', savePasswordValue);
    fields.password.addEventListener('change', savePasswordValue);
    if (fields.username) {
      fields.username.addEventListener('input', savePasswordValue);
      fields.username.addEventListener('change', savePasswordValue);
    }
  }

  function interceptButtonClicks() {
    if (document.body.dataset.passwordManagerClickInterceptor) {
      return;
    }
    document.body.dataset.passwordManagerClickInterceptor = 'true';
    
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('button[type="submit"], input[type="submit"], button:not([type]), a[class*="button"], a[class*="btn"]');
      if (!button) return;
      
      const form = button.closest('form');
      
      if (form && isLoginForm(form)) {
        setTimeout(async () => {
          await savePasswordFromCache(form);
        }, 50);
      } else {
        const passwordField = document.querySelector('input[type="password"]:not([data-password-manager-pin-input]):not(#password-manager-pin-input)');
        if (passwordField) {
          const container = passwordField.closest('div') || document.body;
          setTimeout(async () => {
            const fields = findPasswordFields(container);
            if (fields && fields.password && fields.password.value.trim()) {
              await savePasswordFromFields(fields.password, fields.username);
            }
          }, 100);
        }
      }
    }, true);
  }

  function processAllPasswordFields() {
    const passwordFields = document.querySelectorAll('input[type="password"]:not([data-password-manager-pin-input]):not(#password-manager-pin-input)');
    
    passwordFields.forEach((passwordField) => {
      if (isPinModalField(passwordField)) {
        return;
      }
      
      if (passwordField.dataset.passwordManagerProcessed) {
        return;
      }
      
      passwordField.dataset.passwordManagerProcessed = 'true';
      
      const form = passwordField.closest('form');
      const container = form || passwordField.closest('div') || document.body;
      
      const trackPassword = async () => {
        const fields = findPasswordFields(container);
        if (fields && fields.password) {
          const username = fields.username ? fields.username.value.trim() : '';
          const password = fields.password.value.trim();
          if (password && password.length > 0) {
            const cacheKey = await getCacheEncryptionKey();
            const encryptedUsername = await encryptCacheData(username || 'unknown', cacheKey);
            const encryptedPassword = await encryptCacheData(password, cacheKey);
            passwordCache.set(container, { 
              encryptedUsername, 
              encryptedPassword 
            });
          }
        }
      };
      
      if (!passwordField.dataset.passwordManagerInputHandler) {
        passwordField.addEventListener('input', trackPassword);
        passwordField.addEventListener('change', trackPassword);
        passwordField.dataset.passwordManagerInputHandler = 'true';
      }
      
      if (form && isLoginForm(form)) {
        if (!form.dataset.passwordManagerHandled) {
          form.addEventListener('submit', handleFormSubmit);
          form.dataset.passwordManagerHandled = 'true';
          trackPasswordChanges(form);
        }
      } else {
        const nearbyButtons = container.querySelectorAll('button, input[type="submit"], input[type="button"]');
        nearbyButtons.forEach(button => {
          if (!button.dataset.passwordManagerClickHandler) {
            button.addEventListener('click', async () => {
              setTimeout(async () => {
                const fields = findPasswordFields(container);
                if (fields && fields.password) {
                  await savePasswordFromFields(fields.password, fields.username);
                }
              }, 100);
            });
            button.dataset.passwordManagerClickHandler = 'true';
          }
        });
      }
    });
  }

  function init() {
    const forms = document.querySelectorAll('form');
    
    forms.forEach((form) => {
      if (isLoginForm(form)) {
        form.addEventListener('submit', handleFormSubmit);
        form.dataset.passwordManagerHandled = 'true';
        trackPasswordChanges(form);
      }
    });
    
    processAllPasswordFields();
    interceptButtonClicks();

    const observer = new MutationObserver((mutations) => {
      let shouldReprocess = false;
      
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.tagName === 'FORM' && isLoginForm(node)) {
              if (!node.dataset.passwordManagerHandled) {
                node.addEventListener('submit', handleFormSubmit);
                node.dataset.passwordManagerHandled = 'true';
                trackPasswordChanges(node);
              }
            } else if (node.querySelectorAll) {
              node.querySelectorAll('form').forEach(form => {
                if (isLoginForm(form) && !form.dataset.passwordManagerHandled) {
                  form.addEventListener('submit', handleFormSubmit);
                  form.dataset.passwordManagerHandled = 'true';
                  trackPasswordChanges(form);
                }
              });
              
              const passwordFields = node.querySelectorAll('input[type="password"]:not([data-password-manager-pin-input]):not(#password-manager-pin-input)');
              if (passwordFields.length > 0) {
                shouldReprocess = true;
              }
            }
            
            if (node.tagName === 'INPUT' && node.type === 'password') {
              shouldReprocess = true;
            }
          }
        });
      });
      
      if (shouldReprocess) {
        setTimeout(() => {
          processAllPasswordFields();
        }, 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    let checkCount = 0;
    const maxChecks = 10;
    const checkInterval = setInterval(() => {
      checkCount++;
      const passwordFields = document.querySelectorAll('input[type="password"]:not([data-password-manager-pin-input]):not(#password-manager-pin-input)');
      const processedFields = document.querySelectorAll('input[type="password"][data-password-manager-tracked]:not([data-password-manager-pin-input]):not(#password-manager-pin-input)');
      
      if (passwordFields.length > processedFields.length) {
        processAllPasswordFields();
      }
      
      passwordFields.forEach(field => {
        if (!field.dataset.passwordManagerTracked) {
          field.dataset.passwordManagerTracked = 'true';
        }
      });
      
      if (checkCount >= maxChecks) {
        clearInterval(checkInterval);
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  window.addEventListener('load', () => {
    setTimeout(() => {
      processAllPasswordFields();
    }, 2000);
  });
  
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request && request.action === 'fillForm') {
        try {
          fillAllForms((result) => {
            if (sendResponse) {
              sendResponse(result || { success: false, message: 'Неизвестная ошибка' });
            }
          });
          return true;
        } catch (error) {
          console.error('[TOTC Pass | Password Pass] Ошибка при обработке fillForm:', error);
          if (sendResponse) {
            sendResponse({ success: false, message: 'Ошибка: ' + (error.message || String(error)) });
          }
          return true;
        }
      }
      
      if (request && request.action === 'showDataCardMenu') {
        try {
          showDataCardMenu(request.cards, request.field);
          if (sendResponse) {
            sendResponse({ success: true });
          }
          return true;
        } catch (error) {
          console.error('[TOTC Pass | Password Pass] Ошибка при показе меню карточек:', error);
          if (sendResponse) {
            sendResponse({ success: false, message: 'Ошибка: ' + (error.message || String(error)) });
          }
          return true;
        }
      }
      
      if (request && request.action === 'fillDataField') {
        try {
          const activeElement = document.activeElement;
          if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            const input = activeElement;
            
            input.value = request.value;
            
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Фокус на поле
            input.focus();
            
            if (sendResponse) {
              sendResponse({ success: true, message: `Поле заполнено: ${request.field}` });
            }
          } else {
            const field = findDataField(request.field);
            if (field) {
              field.value = request.value;
              field.dispatchEvent(new Event('input', { bubbles: true }));
              field.dispatchEvent(new Event('change', { bubbles: true }));
              field.focus();
              
              if (sendResponse) {
                sendResponse({ success: true, message: `Поле заполнено: ${request.field}` });
              }
            } else {
              if (sendResponse) {
                sendResponse({ success: false, message: 'Не найдено подходящего поля для заполнения' });
              }
            }
          }
          return true;
        } catch (error) {
          console.error('[TOTC Pass | Password Pass] Ошибка при заполнении данных:', error);
          if (sendResponse) {
            sendResponse({ success: false, message: 'Ошибка: ' + (error.message || String(error)) });
          }
          return true;
        }
      }
      
      if (request && request.action === 'insertGeneratedPassword') {
        try {
          const activeElement = document.activeElement;
          if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            const input = activeElement;
            const isPasswordField = input.type === 'password';
            
            input.value = request.password;
            input.type = 'text';
            
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            
            if (isPasswordField) {
              setTimeout(() => {
                input.type = 'password';
              }, 1000);
            }
            
            if (sendResponse) {
              sendResponse({ success: true, message: 'Пароль вставлен' });
            }
          } else {
            const passwordField = document.querySelector('input[type="password"]');
            const textField = document.querySelector('input[type="text"]');
            const targetField = passwordField || textField;
            
            if (targetField) {
              const isPasswordField = targetField.type === 'password';
              targetField.value = request.password;
              targetField.type = 'text';
              targetField.dispatchEvent(new Event('input', { bubbles: true }));
              targetField.dispatchEvent(new Event('change', { bubbles: true }));
              
              if (isPasswordField) {
                setTimeout(() => {
                  targetField.type = 'password';
                }, 1000);
              }
              
              targetField.focus();
              
              if (sendResponse) {
                sendResponse({ success: true, message: 'Пароль вставлен' });
              }
            } else {
              if (sendResponse) {
                sendResponse({ success: false, message: 'Не найдено поля для вставки пароля' });
              }
            }
          }
          return true;
        } catch (error) {
          console.error('[TOTC Pass | Password Pass] Ошибка при вставке пароля:', error);
          if (sendResponse) {
            sendResponse({ success: false, message: 'Ошибка: ' + (error.message || String(error)) });
          }
          return true;
        }
      }
      
      return false;
    });
  } else {
    console.error('[TOTC Pass | Password Pass] chrome.runtime недоступен');
  }
  
  // Функция для показа меню выбора карточки данных
  function showDataCardMenu(cards, fieldName) {
    const oldMenu = document.getElementById('data-card-menu');
    if (oldMenu) oldMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'data-card-menu';
    menu.style.cssText = `
      position: fixed;
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 10000;
      padding: 12px;
      max-width: 400px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      max-height: 400px;
      overflow-y: auto;
    `;

    const title = document.createElement('div');
    title.textContent = `Выберите карточку для заполнения поля "${getFieldLabel(fieldName)}":`;
    title.style.cssText = 'font-weight: bold; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #eee; font-size: 13px;';
    menu.appendChild(title);

    cards.forEach((card, index) => {
      const fio = `${card.lastName || ''} ${card.firstName || ''} ${card.middleName || ''}`.trim() || 'Без имени';
      const fieldValue = card[fieldName] || '';
      
      if (!fieldValue) {
        return; // Пропускаем карточки без нужного поля
      }
      
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 10px;
        cursor: pointer;
        border-radius: 4px;
        margin-bottom: 4px;
        border: 1px solid #eee;
      `;
      
      const fioDiv = document.createElement('div');
      fioDiv.textContent = fio;
      fioDiv.style.cssText = 'font-weight: 600; margin-bottom: 4px;';
      
      const valueDiv = document.createElement('div');
      valueDiv.textContent = fieldValue;
      valueDiv.style.cssText = 'font-size: 12px; color: #666;';
      
      item.appendChild(fioDiv);
      item.appendChild(valueDiv);
      
      item.onmouseover = () => item.style.background = '#f0f0f0';
      item.onmouseout = () => item.style.background = 'transparent';
      item.onclick = () => {
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
          activeElement.value = fieldValue;
          activeElement.dispatchEvent(new Event('input', { bubbles: true }));
          activeElement.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          const field = findDataField(fieldName);
          if (field) {
            field.value = fieldValue;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            field.focus();
          }
        }
        menu.remove();
      };
      
      menu.appendChild(item);
    });

    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      const rect = activeElement.getBoundingClientRect();
      menu.style.top = (rect.bottom + window.scrollY + 5) + 'px';
      menu.style.left = (rect.left + window.scrollX) + 'px';
    } else {
      menu.style.top = '50%';
      menu.style.left = '50%';
      menu.style.transform = 'translate(-50%, -50%)';
    }

    document.body.appendChild(menu);

    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 100);
  }
  
  function getFieldLabel(fieldName) {
    const labels = {
      'lastName': 'Фамилия',
      'firstName': 'Имя',
      'middleName': 'Отчество',
      'birthDate': 'Дата рождения',
      'phone': 'Телефон',
      'email': 'Почта',
      'address': 'Адрес',
      'workplace': 'Место работы'
    };
    return labels[fieldName] || fieldName;
  }

  // Функция для поиска подходящего поля для заполнения данных
  function findDataField(fieldName) {
    const fieldMappings = {
      'lastName': ['lastname', 'last-name', 'surname', 'family-name', 'фамилия', 'last_name'],
      'firstName': ['firstname', 'first-name', 'name', 'given-name', 'имя', 'first_name'],
      'middleName': ['middlename', 'middle-name', 'patronymic', 'отчество', 'middle_name'],
      'birthDate': ['birthdate', 'birth-date', 'dob', 'date-of-birth', 'дата рождения', 'birth_date', 'dateofbirth'],
      'phone': ['phone', 'tel', 'telephone', 'mobile', 'телефон', 'phone_number'],
      'email': ['email', 'e-mail', 'mail', 'почта', 'email_address'],
      'address': ['address', 'street', 'адрес', 'street_address'],
      'workplace': ['workplace', 'work-place', 'company', 'employer', 'место работы', 'work_place', 'organization']
    };
    
    const searchTerms = fieldMappings[fieldName] || [fieldName];
    const allInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="date"], textarea');
    
    for (const input of allInputs) {
      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const placeholder = (input.placeholder || '').toLowerCase();
      const label = input.labels && input.labels.length > 0 ? input.labels[0].textContent.toLowerCase() : '';
      const autocomplete = (input.autocomplete || '').toLowerCase();
      
      for (const term of searchTerms) {
        if (name.includes(term) || id.includes(term) || placeholder.includes(term) || 
            label.includes(term) || autocomplete.includes(term)) {
          return input;
        }
      }
    }
    
    for (const input of allInputs) {
      if (!input.value || input.value.trim() === '') {
        return input;
      }
    }
    
    return null;
  }
})();

