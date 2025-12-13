importScripts('crypto-utils.js');

function escapeHtml(text) {
  if (typeof text !== 'string') {
    text = String(text);
  }
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

let sessionPin = null;
let pinTimeoutId = null;
const PIN_TIMEOUT = 5 * 60 * 1000;

const messageRateLimit = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX_REQUESTS = 30;

const pinAttempts = new Map();
const PIN_RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const PIN_MAX_ATTEMPTS = 5;

function checkRateLimit(senderId) {
  const now = Date.now();
  const senderKey = senderId || 'unknown';
  
  if (!messageRateLimit.has(senderKey)) {
    messageRateLimit.set(senderKey, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  const limit = messageRateLimit.get(senderKey);
  
  if (now > limit.resetTime) {
    limit.count = 1;
    limit.resetTime = now + RATE_LIMIT_WINDOW;
    return true;
  }
  
  if (limit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  limit.count++;
  return true;
}

async function isValidSender(sender) {
  if (!sender) {
    return false;
  }
  
  if (sender.id === chrome.runtime.id) {
    if (sender.origin && sender.origin.startsWith('chrome-extension://')) {
      const extensionId = sender.origin.replace('chrome-extension://', '').split('/')[0];
      if (extensionId === chrome.runtime.id) {
        return true;
      }
    }
    return true;
  }
  
  if (sender.tab && sender.tab.id) {
    try {
      const url = sender.tab.url;
      if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://') || url.startsWith('about:')) {
        return false;
      }
      
      if (sender.origin) {
        try {
          const tabUrl = new URL(url);
          const originUrl = new URL(sender.origin);
          if (tabUrl.origin !== originUrl.origin) {
            return false;
          }
        } catch (e) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Ошибка при проверке sender:', error);
      return false;
    }
  }
  
  return false;
}

function resetPinTimeout() {
  if (pinTimeoutId) {
    clearTimeout(pinTimeoutId);
  }
  pinTimeoutId = setTimeout(() => {
    sessionPin = null;
    pinTimeoutId = null;
  }, PIN_TIMEOUT);
}

function clearPinSafely() {
  if (sessionPin) {
    const pinLength = sessionPin.length;
    if (pinLength > 0) {
      sessionPin = '0'.repeat(pinLength);
    }
    sessionPin = null;
    if (pinTimeoutId) {
      clearTimeout(pinTimeoutId);
      pinTimeoutId = null;
    }
    if (global.gc && typeof global.gc === 'function') {
      try {
        global.gc();
      } catch (e) {
      }
    }
  }
}

async function isDomainWhitelisted(domain) {
  try {
    const result = await chrome.storage.local.get(['whitelist']);
    const whitelist = result.whitelist || [];
    
    if (whitelist.includes(domain)) {
      return true;
    }
    
    for (const pattern of whitelist) {
      if (pattern.startsWith('*.')) {
        const baseDomain = pattern.substring(2);
        if (domain === baseDomain || domain.endsWith('.' + baseDomain)) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Ошибка при проверке белого списка:', error);
    return false;
  }
}

async function getPin() {
  if (sessionPin) {
    resetPinTimeout();
    return sessionPin;
  }
  
  throw new Error('PIN-код не установлен в сессии. Откройте popup и введите PIN-код.');
}

async function savePassword(domain, url, username, password) {
  try {
    if (await isDomainWhitelisted(domain)) {
      return { success: false, error: 'Домен находится в белом списке' };
    }
    
    const pinSet = await isPinSet();
    if (!pinSet) {
      return { success: false, error: 'PIN-код не установлен. Откройте настройки расширения.' };
    }
    
    let pin;
    try {
      pin = await getPin();
    } catch (error) {
      return { success: false, error: 'Требуется PIN-код для сохранения пароля' };
    }
    
    const result = await chrome.storage.local.get(['passwords']);
    const passwords = result.passwords || {};
    
    if (!passwords[domain]) {
      passwords[domain] = [];
    }

    const existingIndex = passwords[domain].findIndex(
      p => p.username === username && p.url === url
    );

    let encryptedPassword;
    try {
      encryptedPassword = await encryptText(password, pin);
    } catch (encryptError) {
      console.error('Ошибка при шифровании пароля:', encryptError);
      return { success: false, error: 'Не удалось зашифровать пароль: ' + encryptError.message };
    }
    
    const passwordEntry = {
      username: username,
      password: encryptedPassword,
      url: url,
      domain: domain,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      category: null,
      tags: [],
      allowExport: true
    };

    if (existingIndex >= 0) {
      passwords[domain][existingIndex] = passwordEntry;
    } else {
      passwords[domain].push(passwordEntry);
    }

    await chrome.storage.local.set({ passwords: passwords });
    
    const sanitizedUsername = escapeHtml(username);
    const sanitizedDomain = escapeHtml(domain);
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Пароль сохранён',
      message: `Пароль для ${sanitizedUsername} на ${sanitizedDomain} успешно сохранён`
    }).catch(() => {});

    return { success: true };
  } catch (error) {
    console.error('Ошибка при сохранении пароля:', error);
    return { success: false, error: error.message };
  }
}

async function getPasswords(domain) {
  try {
    if (await isDomainWhitelisted(domain)) {
      return { passwords: [] };
    }
    
    const pinSet = await isPinSet();
    if (!pinSet) {
      return { passwords: [] };
    }
    
    let pin;
    try {
      pin = await getPin();
    } catch (error) {
      return { passwords: [], error: 'Требуется PIN-код для получения паролей' };
    }
    
    const result = await chrome.storage.local.get(['passwords']);
    const passwords = result.passwords || {};
    
    if (!passwords[domain]) {
      return { passwords: [] };
    }

    const decryptedPasswords = [];
    for (const p of passwords[domain]) {
      try {
        const decryptedPassword = await decryptText(p.password, pin);
        decryptedPasswords.push({
          ...p,
          password: decryptedPassword
        });
      } catch (error) {
        console.error('Ошибка при расшифровке пароля:', error);
      }
    }

    return { passwords: decryptedPasswords };
  } catch (error) {
    console.error('Ошибка при получении паролей:', error);
    return { passwords: [] };
  }
}

async function getAllPasswords() {
  try {
    const pinSet = await isPinSet();
    if (!pinSet) {
      return { passwords: [] };
    }
    
    let pin;
    try {
      pin = await getPin();
    } catch (error) {
      return { passwords: [], error: 'Требуется PIN-код для получения паролей' };
    }
    
    const result = await chrome.storage.local.get(['passwords']);
    const passwords = result.passwords || {};
    
    const allPasswords = [];
    for (const domain in passwords) {
      if (await isDomainWhitelisted(domain)) {
        continue;
      }
      
      for (const p of passwords[domain]) {
        try {
          const decryptedPassword = await decryptText(p.password, pin);
          allPasswords.push({
            ...p,
            password: decryptedPassword,
            domain: domain
          });
        } catch (error) {
          console.error('Ошибка при расшифровке пароля:', error);
        }
      }
    }

    return { passwords: allPasswords };
  } catch (error) {
    console.error('Ошибка при получении всех паролей:', error);
    return { passwords: [] };
  }
}

async function deletePassword(domain, url, username) {
  try {
    const result = await chrome.storage.local.get(['passwords']);
    const passwords = result.passwords || {};
    
    if (passwords[domain]) {
      passwords[domain] = passwords[domain].filter(
        p => !(p.username === username && p.url === url)
      );
      
      if (passwords[domain].length === 0) {
        delete passwords[domain];
      }
      
      await chrome.storage.local.set({ passwords: passwords });
    }

    return { success: true };
  } catch (error) {
    console.error('Ошибка при удалении пароля:', error);
    return { success: false, error: error.message };
  }
}

async function updatePassword(oldDomain, oldUrl, oldUsername, newDomain, newUrl, newUsername, newPassword) {
  try {
    if (await isDomainWhitelisted(newDomain)) {
      return { success: false, error: 'Новый домен находится в белом списке' };
    }
    
    const pinSet = await isPinSet();
    if (!pinSet) {
      return { success: false, error: 'PIN-код не установлен. Откройте настройки расширения.' };
    }
    
    let pin;
    try {
      pin = await getPin();
    } catch (error) {
      return { success: false, error: 'Требуется PIN-код для обновления пароля' };
    }
    
    const result = await chrome.storage.local.get(['passwords']);
    const passwords = result.passwords || {};
    
    // Находим и удаляем старую запись
    if (passwords[oldDomain]) {
      const oldIndex = passwords[oldDomain].findIndex(
        p => p.username === oldUsername && p.url === oldUrl
      );
      
      if (oldIndex >= 0) {
        const oldEntry = passwords[oldDomain][oldIndex];
        passwords[oldDomain].splice(oldIndex, 1);
        
        if (passwords[oldDomain].length === 0) {
          delete passwords[oldDomain];
        }
        
        // Создаём новую запись с обновлёнными данными
        if (!passwords[newDomain]) {
          passwords[newDomain] = [];
        }
        
        let encryptedPassword;
        try {
          encryptedPassword = await encryptText(newPassword, pin);
        } catch (encryptError) {
          console.error('Ошибка при шифровании пароля:', encryptError);
          return { success: false, error: 'Не удалось зашифровать пароль: ' + encryptError.message };
        }
        
        const updatedEntry = {
          username: newUsername,
          password: encryptedPassword,
          url: newUrl,
          domain: newDomain,
          createdAt: oldEntry.createdAt || Date.now(),
          updatedAt: Date.now()
        };
        
        passwords[newDomain].push(updatedEntry);
        await chrome.storage.local.set({ passwords: passwords });
        
        return { success: true };
      } else {
        return { success: false, error: 'Пароль не найден' };
      }
    } else {
      return { success: false, error: 'Пароль не найден' };
    }
  } catch (error) {
    console.error('Ошибка при обновлении пароля:', error);
    return { success: false, error: error.message };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      const isValid = await isValidSender(sender);
      if (!isValid) {
        console.error('Неверный источник сообщения:', sender);
        sendResponse({ success: false, error: 'Неавторизованный запрос' });
        return;
      }
      
      if (request.action && ['savePassword', 'getPasswords', 'getAllPasswords', 'deletePassword'].includes(request.action)) {
        if (request.timestamp !== undefined && request.timestamp !== null) {
          const now = Date.now();
          const requestTime = request.timestamp;
          const maxAge = 5 * 60 * 1000; // 5 минут
          
          if (Math.abs(now - requestTime) > maxAge) {
            console.error('Сообщение устарело или имеет неверный timestamp');
            sendResponse({ success: false, error: 'Сообщение устарело' });
            return;
          }
        }
        
        if (request.nonce) {
          const nonceKey = `nonce_${request.nonce}`;
          const nonceCheck = await chrome.storage.local.get([nonceKey]);
          if (nonceCheck[nonceKey]) {
            console.error('Обнаружена попытка реплей-атаки');
            sendResponse({ success: false, error: 'Неверный запрос' });
            return;
          }
          const now = Date.now();
          await chrome.storage.local.set({ [nonceKey]: now });
          setTimeout(async () => {
            await chrome.storage.local.remove([nonceKey]);
          }, 10 * 60 * 1000);
        }
      }
      
      const senderId = sender.tab ? `tab_${sender.tab.id}` : sender.id || 'unknown';
      if (!checkRateLimit(senderId)) {
        sendResponse({ success: false, error: 'Превышен лимит запросов. Попробуйте позже.' });
        return;
      }
      
      switch (request.action) {
        case 'savePassword':
          const saveResult = await savePassword(
            request.domain,
            request.url,
            request.username,
            request.password
          );
          sendResponse(saveResult);
          break;

        case 'getPasswords':
          const getResult = await getPasswords(request.domain);
          sendResponse(getResult);
          break;

        case 'getAllPasswords':
          const allResult = await getAllPasswords();
          sendResponse(allResult);
          break;

        case 'deletePassword':
          const deleteResult = await deletePassword(
            request.domain,
            request.url,
            request.username
          );
          sendResponse(deleteResult);
          break;

        case 'updatePassword':
          const updateResult = await updatePassword(
            request.oldDomain,
            request.oldUrl,
            request.oldUsername,
            request.newDomain,
            request.newUrl,
            request.newUsername,
            request.newPassword
          );
          sendResponse(updateResult);
          break;
          
        case 'updatePasswordMetadata':
          const metadataResult = await updatePasswordMetadata(
            request.domain,
            request.url,
            request.username,
            request.category,
            request.tags,
            request.allowExport
          );
          sendResponse(metadataResult);
          break;
          
        case 'generatePassword':
          try {
            const settings = request.settings || {
              length: 16,
              includeUppercase: true,
              includeLowercase: true,
              includeNumbers: true,
              includeSpecial: true,
              excludeSimilar: true
            };
            
            const generatedPassword = await generatePasswordInline(settings);
            sendResponse({ success: true, password: generatedPassword });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          break;
          
        case 'checkWhitelist':
          const isWhitelisted = await isDomainWhitelisted(request.domain);
          sendResponse({ whitelisted: isWhitelisted });
          break;
          
        case 'setSessionPin':
          sessionPin = request.pin;
          resetPinTimeout();
          sendResponse({ success: true });
          break;
          
        case 'checkSessionPin':
          sendResponse({ hasPin: !!sessionPin });
          break;
          
        case 'verifyAndSetPin':
          try {
            const senderId = sender.tab ? `tab_${sender.tab.id}` : sender.id || 'unknown';
            const pinKey = `pin_attempts_${senderId}`;
            const now = Date.now();
            
            const pinLimitData = pinAttempts.get(pinKey);
            if (pinLimitData) {
              if (now < pinLimitData.resetTime) {
                if (pinLimitData.count >= PIN_MAX_ATTEMPTS) {
                  const minutesLeft = Math.ceil((pinLimitData.resetTime - now) / 60000);
                  sendResponse({ success: false, error: `Превышен лимит попыток. Попробуйте через ${minutesLeft} мин.` });
                  return;
                }
              } else {
                pinAttempts.delete(pinKey);
              }
            }
            
            const isValid = await verifyPin(request.pin);
            if (isValid) {
              pinAttempts.delete(pinKey);
              sessionPin = request.pin;
              resetPinTimeout();
              sendResponse({ success: true });
            } else {
              if (!pinAttempts.has(pinKey)) {
                pinAttempts.set(pinKey, { count: 1, resetTime: now + PIN_RATE_LIMIT_WINDOW });
              } else {
                const limit = pinAttempts.get(pinKey);
                limit.count++;
                pinAttempts.set(pinKey, limit);
              }
              sendResponse({ success: false, error: 'Неверный PIN-код' });
            }
          } catch (error) {
            sendResponse({ success: false, error: error.message || 'Ошибка при проверке PIN-кода' });
          }
          break;
          
        case 'clearSessionPin':
          clearPinSafely();
          sendResponse({ success: true });
          break;
          
        case 'authenticateWithBiometric':
          try {
            // Проверяем, что биометрия включена и зарегистрирована
            const biometricData = await chrome.storage.local.get(['biometricEnabled', 'biometricCredentialId']);
            
            if (!biometricData.biometricEnabled || !biometricData.biometricCredentialId) {
              sendResponse({ success: false, error: 'Биометрическая аутентификация не настроена' });
              return;
            }
            
            // Проверяем, что assertion соответствует зарегистрированному ключу
            if (request.assertion && request.assertion.id === biometricData.biometricCredentialId) {
              // Биометрия успешно проверена
              // Получаем зашифрованный PIN для биометрии
              const encryptedPinData = await chrome.storage.local.get(['biometricEncryptedPin', 'biometricPinKey']);
              
              if (encryptedPinData.biometricEncryptedPin && encryptedPinData.biometricPinKey) {
                try {
                  // Расшифровываем PIN используя ключ
                  const decryptedPin = await decryptWithKey(encryptedPinData.biometricEncryptedPin, encryptedPinData.biometricPinKey);
                  
                  if (decryptedPin) {
                    // Проверяем PIN перед установкой в сессию
                    const isValid = await verifyPin(decryptedPin);
                    if (isValid) {
                      // Устанавливаем PIN в сессию
                      sessionPin = decryptedPin;
                      resetPinTimeout();
                      sendResponse({ success: true, pin: decryptedPin });
                      return;
                    }
                  }
                } catch (decryptError) {
                  console.error('Ошибка при расшифровке PIN:', decryptError);
                }
              }
              
              // Если зашифрованный PIN не найден или не удалось расшифровать,
              // возвращаем успех, но без PIN - пользователю нужно будет ввести PIN вручную
              sendResponse({ 
                success: true, 
                biometricVerified: true,
                requiresPin: true,
                message: 'Биометрия подтверждена. Введите PIN для доступа к данным.'
              });
            } else {
              sendResponse({ success: false, error: 'Неверные биометрические данные' });
            }
          } catch (error) {
            console.error('Ошибка при биометрической аутентификации:', error);
            sendResponse({ success: false, error: error.message || 'Ошибка при аутентификации' });
          }
          break;
          
        case 'saveBiometricPin':
          try {
            // Сохраняем PIN в зашифрованном виде для использования с биометрией
            const pin = request.pin;
            if (!pin) {
              sendResponse({ success: false, error: 'PIN не предоставлен' });
              return;
            }
            
            // Генерируем ключ для шифрования PIN
            const key = await generateTempKey();
            const encryptedPin = await encryptWithKey(pin, key);
            
            await chrome.storage.local.set({
              biometricEncryptedPin: encryptedPin,
              biometricPinKey: key
            });
            
            sendResponse({ success: true });
          } catch (error) {
            console.error('Ошибка при сохранении PIN для биометрии:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;
          
        case 'savePendingPassword':
          try {
            const result = await chrome.storage.local.get(['pendingPasswords', 'pendingPasswordsKey']);
            let tempKey = result.pendingPasswordsKey;
            
            if (!tempKey) {
              tempKey = await generateTempKey();
              await chrome.storage.local.set({ pendingPasswordsKey: tempKey });
            }
            
            const encryptedPassword = await encryptWithKey(request.password, tempKey);
            const pendingPasswords = result.pendingPasswords || [];
            
            pendingPasswords.push({
              domain: request.domain,
              url: request.url,
              username: request.username,
              password: encryptedPassword,
              timestamp: Date.now()
            });
            await chrome.storage.local.set({ pendingPasswords: pendingPasswords });
            sendResponse({ success: true });
          } catch (error) {
            console.error('Ошибка при сохранении ожидающего пароля:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;
          
        case 'getPendingPasswords':
          try {
            const result = await chrome.storage.local.get(['pendingPasswords', 'pendingPasswordsKey']);
            const pendingPasswords = result.pendingPasswords || [];
            const tempKey = result.pendingPasswordsKey;
            
            const decryptedPasswords = [];
            if (tempKey && pendingPasswords.length > 0) {
              for (const pwd of pendingPasswords) {
                try {
                  const decryptedPassword = await decryptWithKey(pwd.password, tempKey);
                  decryptedPasswords.push({
                    ...pwd,
                    password: decryptedPassword
                  });
                } catch (error) {
                  console.error('Ошибка при расшифровке ожидающего пароля:', error);
                }
              }
            }
            
            sendResponse({ passwords: decryptedPasswords });
          } catch (error) {
            console.error('Ошибка при получении ожидающих паролей:', error);
            sendResponse({ passwords: [] });
          }
          break;
          
        case 'clearPendingPasswords':
          try {
            await chrome.storage.local.set({ pendingPasswords: [], pendingPasswordsKey: null });
            sendResponse({ success: true });
          } catch (error) {
            console.error('Ошибка при очистке ожидающих паролей:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;
          
        case 'openPopup':
          try {
            chrome.action.openPopup();
            sendResponse({ success: true });
          } catch (error) {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon48.png',
              title: 'Требуется PIN-код',
              message: 'Откройте попап расширения и введите PIN-код для сохранения пароля'
            }).catch(() => {});
            sendResponse({ success: false, error: 'Не удалось открыть попап автоматически' });
          }
          break;
          
        case 'showNotification':
          try {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon48.png',
              title: request.title || 'Уведомление',
              message: request.message || ''
            }).catch(() => {});
            sendResponse({ success: true });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          break;
          
        case 'getAllDataCards':
          try {
            const pinSet = await isPinSet();
            if (!pinSet) {
              sendResponse({ cards: [] });
              return;
            }
            
            let pin;
            try {
              pin = await getPin();
            } catch (error) {
              sendResponse({ cards: [], error: 'Требуется PIN-код для получения данных' });
              return;
            }
            
            const result = await chrome.storage.local.get(['dataCards']);
            const encryptedCards = result.dataCards || [];
            
            const decryptedCards = [];
            for (const encryptedCard of encryptedCards) {
              try {
                const decryptedData = await decryptText(encryptedCard.data, pin);
                const card = JSON.parse(decryptedData);
                decryptedCards.push(card);
              } catch (error) {
                console.error('Ошибка при расшифровке карточки:', error);
              }
            }
            
            sendResponse({ cards: decryptedCards });
          } catch (error) {
            console.error('Ошибка при получении карточек данных:', error);
            sendResponse({ cards: [], error: error.message });
          }
          break;
          
        case 'saveDataCard':
          try {
            const pinSet = await isPinSet();
            if (!pinSet) {
              sendResponse({ success: false, error: 'PIN-код не установлен' });
              return;
            }
            
            let pin;
            try {
              pin = await getPin();
            } catch (error) {
              sendResponse({ success: false, error: 'Требуется PIN-код для сохранения данных' });
              return;
            }
            
            const result = await chrome.storage.local.get(['dataCards']);
            const encryptedCards = result.dataCards || [];
            
            const encryptedData = await encryptText(JSON.stringify(request.cardData), pin);
            encryptedCards.push({ data: encryptedData });
            
            await chrome.storage.local.set({ dataCards: encryptedCards });
            sendResponse({ success: true });
          } catch (error) {
            console.error('Ошибка при сохранении карточки данных:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;
          
        case 'updateDataCard':
          try {
            const pinSet = await isPinSet();
            if (!pinSet) {
              sendResponse({ success: false, error: 'PIN-код не установлен' });
              return;
            }
            
            let pin;
            try {
              pin = await getPin();
            } catch (error) {
              sendResponse({ success: false, error: 'Требуется PIN-код для обновления данных' });
              return;
            }
            
            const result = await chrome.storage.local.get(['dataCards']);
            const encryptedCards = result.dataCards || [];
            
            if (request.cardIndex >= 0 && request.cardIndex < encryptedCards.length) {
              const encryptedData = await encryptText(JSON.stringify(request.cardData), pin);
              encryptedCards[request.cardIndex] = { data: encryptedData };
              await chrome.storage.local.set({ dataCards: encryptedCards });
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: 'Карточка не найдена' });
            }
          } catch (error) {
            console.error('Ошибка при обновлении карточки данных:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;
          
        case 'deleteDataCard':
          try {
            const result = await chrome.storage.local.get(['dataCards']);
            const encryptedCards = result.dataCards || [];
            
            if (request.cardIndex >= 0 && request.cardIndex < encryptedCards.length) {
              encryptedCards.splice(request.cardIndex, 1);
              await chrome.storage.local.set({ dataCards: encryptedCards });
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: 'Карточка не найдена' });
            }
          } catch (error) {
            console.error('Ошибка при удалении карточки данных:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;
          
        case 'getDataCard':
          try {
            const pinSet = await isPinSet();
            if (!pinSet) {
              sendResponse({ success: false, error: 'PIN-код не установлен' });
              return;
            }
            
            let pin;
            try {
              pin = await getPin();
            } catch (error) {
              sendResponse({ success: false, error: 'Требуется PIN-код для получения данных' });
              return;
            }
            
            const result = await chrome.storage.local.get(['dataCards']);
            const encryptedCards = result.dataCards || [];
            
            if (request.cardIndex >= 0 && request.cardIndex < encryptedCards.length) {
              const decryptedData = await decryptText(encryptedCards[request.cardIndex].data, pin);
              const card = JSON.parse(decryptedData);
              sendResponse({ success: true, card: card });
            } else {
              sendResponse({ success: false, error: 'Карточка не найдена' });
            }
          } catch (error) {
            console.error('Ошибка при получении карточки данных:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'getAllTotp':
          try {
            const pinSet = await isPinSet();
            if (!pinSet) {
              sendResponse({ totpList: [] });
              return;
            }
            
            let pin;
            try {
              pin = await getPin();
            } catch (error) {
              sendResponse({ totpList: [], error: 'Требуется PIN-код для получения 2FA кодов' });
              return;
            }
            
            const result = await chrome.storage.local.get(['totpList']);
            const encryptedTotpList = result.totpList || [];
            
            const decryptedTotpList = [];
            for (const encryptedTotp of encryptedTotpList) {
              try {
                const decryptedData = await decryptText(encryptedTotp.data, pin);
                const totp = JSON.parse(decryptedData);
                decryptedTotpList.push(totp);
              } catch (error) {
                console.error('Ошибка при расшифровке TOTP:', error);
              }
            }
            
            sendResponse({ totpList: decryptedTotpList });
          } catch (error) {
            console.error('Ошибка при получении TOTP кодов:', error);
            sendResponse({ totpList: [], error: error.message });
          }
          break;
          
        case 'saveTotp':
          try {
            const pinSet = await isPinSet();
            if (!pinSet) {
              sendResponse({ success: false, error: 'PIN-код не установлен' });
              return;
            }
            
            let pin;
            try {
              pin = await getPin();
            } catch (error) {
              sendResponse({ success: false, error: 'Требуется PIN-код для сохранения 2FA кода' });
              return;
            }
            
            const result = await chrome.storage.local.get(['totpList']);
            const encryptedTotpList = result.totpList || [];
            
            const totpData = {
              service: request.service,
              login: request.login,
              secret: request.secret,
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            
            const encryptedData = await encryptText(JSON.stringify(totpData), pin);
            encryptedTotpList.push({ data: encryptedData });
            
            await chrome.storage.local.set({ totpList: encryptedTotpList });
            sendResponse({ success: true });
          } catch (error) {
            console.error('Ошибка при сохранении TOTP:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;
          
        case 'updateTotp':
          try {
            const pinSet = await isPinSet();
            if (!pinSet) {
              sendResponse({ success: false, error: 'PIN-код не установлен' });
              return;
            }
            
            let pin;
            try {
              pin = await getPin();
            } catch (error) {
              sendResponse({ success: false, error: 'Требуется PIN-код для обновления 2FA кода' });
              return;
            }
            
            const result = await chrome.storage.local.get(['totpList']);
            const encryptedTotpList = result.totpList || [];
            
            if (request.index >= 0 && request.index < encryptedTotpList.length) {
              const oldTotpData = JSON.parse(await decryptText(encryptedTotpList[request.index].data, pin));
              
              const totpData = {
                service: request.service,
                login: request.login,
                secret: request.secret,
                createdAt: oldTotpData.createdAt || Date.now(),
                updatedAt: Date.now()
              };
              
              const encryptedData = await encryptText(JSON.stringify(totpData), pin);
              encryptedTotpList[request.index] = { data: encryptedData };
              await chrome.storage.local.set({ totpList: encryptedTotpList });
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: '2FA код не найден' });
            }
          } catch (error) {
            console.error('Ошибка при обновлении TOTP:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;
          
        case 'deleteTotp':
          try {
            const result = await chrome.storage.local.get(['totpList']);
            const encryptedTotpList = result.totpList || [];
            
            if (request.index >= 0 && request.index < encryptedTotpList.length) {
              encryptedTotpList.splice(request.index, 1);
              await chrome.storage.local.set({ totpList: encryptedTotpList });
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: '2FA код не найден' });
            }
          } catch (error) {
            console.error('Ошибка при удалении TOTP:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        default:
          sendResponse({ success: false, error: 'Неизвестное действие' });
      }
    } catch (error) {
      console.error('Ошибка при обработке сообщения:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true;
});

async function generatePasswordInline(settings) {
  const length = Math.max(8, Math.min(128, settings.length || 16));
  const excludeSimilar = settings.excludeSimilar !== false;
  
  const CHAR_SETS = excludeSimilar ? {
    uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    lowercase: 'abcdefghijkmnopqrstuvwxyz',
    numbers: '23456789',
    special: '!@#$%^&*()_+-=[]{}|;:,.<>?'
  } : {
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    special: '!@#$%^&*()_+-=[]{}|;:,.<>?'
  };
  
  let availableChars = '';
  if (settings.includeUppercase !== false) availableChars += CHAR_SETS.uppercase;
  if (settings.includeLowercase !== false) availableChars += CHAR_SETS.lowercase;
  if (settings.includeNumbers !== false) availableChars += CHAR_SETS.numbers;
  if (settings.includeSpecial !== false) availableChars += CHAR_SETS.special;
  
  if (availableChars.length === 0) return '';
  
  const passwordArray = new Array(length);
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  
  for (let i = 0; i < length; i++) {
    const randomIndex = randomValues[i] % availableChars.length;
    passwordArray[i] = availableChars[randomIndex];
  }
  
  return passwordArray.join('');
}

async function updatePasswordMetadata(domain, url, username, category, tags, allowExport) {
  try {
    const result = await chrome.storage.local.get(['passwords']);
    const passwords = result.passwords || {};
    
    if (passwords[domain]) {
      const passwordIndex = passwords[domain].findIndex(
        p => p.username === username && p.url === url
      );
      
      if (passwordIndex >= 0) {
        if (category !== undefined) {
          passwords[domain][passwordIndex].category = category;
        }
        if (tags !== undefined) {
          passwords[domain][passwordIndex].tags = tags;
        }
        if (allowExport !== undefined) {
          passwords[domain][passwordIndex].allowExport = allowExport;
        }
        passwords[domain][passwordIndex].updatedAt = Date.now();
        
        await chrome.storage.local.set({ passwords: passwords });
        return { success: true };
      }
    }
    
    return { success: false, error: 'Пароль не найден' };
  } catch (error) {
    console.error('Ошибка при обновлении метаданных пароля:', error);
    return { success: false, error: error.message };
  }
}

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'fill-login-form',
      title: 'Заполнить форму входа',
      contexts: ['page', 'editable']
    });
    chrome.contextMenus.create({
      id: 'generate-password',
      title: 'Сгенерировать пароль',
      contexts: ['editable']
    });
    chrome.contextMenus.create({
      id: 'fill-data',
      title: 'Данные',
      contexts: ['editable']
    });
    chrome.contextMenus.create({
      id: 'fill-lastName',
      parentId: 'fill-data',
      title: 'Фамилия',
      contexts: ['editable']
    });
    chrome.contextMenus.create({
      id: 'fill-firstName',
      parentId: 'fill-data',
      title: 'Имя',
      contexts: ['editable']
    });
    chrome.contextMenus.create({
      id: 'fill-middleName',
      parentId: 'fill-data',
      title: 'Отчество',
      contexts: ['editable']
    });
    chrome.contextMenus.create({
      id: 'fill-birthDate',
      parentId: 'fill-data',
      title: 'Дата рождения',
      contexts: ['editable']
    });
    chrome.contextMenus.create({
      id: 'fill-phone',
      parentId: 'fill-data',
      title: 'Телефон',
      contexts: ['editable']
    });
    chrome.contextMenus.create({
      id: 'fill-email',
      parentId: 'fill-data',
      title: 'Почта',
      contexts: ['editable']
    });
    chrome.contextMenus.create({
      id: 'fill-address',
      parentId: 'fill-data',
      title: 'Адрес',
      contexts: ['editable']
    });
    chrome.contextMenus.create({
      id: 'fill-workplace',
      parentId: 'fill-data',
      title: 'Место работы',
      contexts: ['editable']
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  createContextMenu();
  
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

createContextMenu();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // Обработка заполнения данных
  const dataFields = ['fill-lastName', 'fill-firstName', 'fill-middleName', 'fill-birthDate', 'fill-phone', 'fill-email', 'fill-address', 'fill-workplace'];
  if (dataFields.includes(info.menuItemId)) {
    if (!tab || !tab.id) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Ошибка',
        message: 'Вкладка недоступна'
      }).catch(() => {});
      return;
    }
    
    try {
      // Получаем все карточки данных
      const pinSet = await isPinSet();
      if (!pinSet) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Ошибка',
          message: 'PIN-код не установлен. Заполните данные в настройках расширения.'
        }).catch(() => {});
        return;
      }
      
      let pin;
      try {
        pin = await getPin();
      } catch (error) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Требуется PIN-код',
          message: 'Откройте popup расширения и введите PIN-код для использования данных'
        }).catch(() => {});
        return;
      }
      
      const result = await chrome.storage.local.get(['dataCards']);
      const encryptedCards = result.dataCards || [];
      
      if (encryptedCards.length === 0) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Ошибка',
          message: 'Карточки данных не найдены. Добавьте карточку в настройках расширения.'
        }).catch(() => {});
        return;
      }
      
      // Если карточка одна, используем её напрямую
      if (encryptedCards.length === 1) {
        const decryptedData = await decryptText(encryptedCards[0].data, pin);
        const card = JSON.parse(decryptedData);
        const fieldName = info.menuItemId.replace('fill-', '');
        const fieldValue = card[fieldName] || '';
        
        if (!fieldValue) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Внимание',
            message: `Поле "${getFieldLabel(fieldName)}" не заполнено в карточке`
          }).catch(() => {});
          return;
        }
        
        chrome.tabs.sendMessage(tab.id, {
          action: 'fillDataField',
          field: fieldName,
          value: fieldValue
        }, (response) => {
          if (chrome.runtime.lastError) {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon48.png',
              title: 'Ошибка',
              message: 'Не удалось заполнить поле. Убедитесь, что вы находитесь на странице с полем ввода.'
            }).catch(() => {});
          } else if (response && response.success) {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon48.png',
              title: 'Успешно',
              message: `Поле "${getFieldLabel(fieldName)}" заполнено`
            }).catch(() => {});
          }
        });
      } else {
        // Если карточек несколько, показываем меню выбора
        const decryptedCards = [];
        for (const encryptedCard of encryptedCards) {
          try {
            const decryptedData = await decryptText(encryptedCard.data, pin);
            const card = JSON.parse(decryptedData);
            decryptedCards.push(card);
          } catch (error) {
            console.error('Ошибка при расшифровке карточки:', error);
          }
        }
        
        const fieldName = info.menuItemId.replace('fill-', '');
        
        // Отправляем карточки в content script для показа меню выбора
        chrome.tabs.sendMessage(tab.id, {
          action: 'showDataCardMenu',
          cards: decryptedCards,
          field: fieldName
        }, (response) => {
          if (chrome.runtime.lastError) {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon48.png',
              title: 'Ошибка',
              message: 'Не удалось показать меню выбора. Убедитесь, что вы находитесь на странице.'
            }).catch(() => {});
          }
        });
      }
    } catch (error) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Ошибка',
        message: 'Ошибка при заполнении данных: ' + error.message
      }).catch(() => {});
    }
    return;
  }
  
  if (info.menuItemId === 'generate-password') {
    if (!tab || !tab.id) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Ошибка',
        message: 'Вкладка недоступна'
      }).catch(() => {});
      return;
    }
    
    try {
      // Получаем настройки генератора
      const settingsResult = await chrome.storage.local.get(['passwordGeneratorSettings']);
      const defaultSettings = {
        length: 16,
        includeUppercase: true,
        includeLowercase: true,
        includeNumbers: true,
        includeSpecial: true,
        excludeSimilar: true
      };
      const settings = settingsResult.passwordGeneratorSettings || defaultSettings;
      
      // Генерируем пароль
      const password = await generatePasswordInline(settings);
      
      // Отправляем пароль в content script для вставки
      chrome.tabs.sendMessage(tab.id, {
        action: 'insertGeneratedPassword',
        password: password
      }, (response) => {
        if (chrome.runtime.lastError) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Ошибка',
            message: 'Не удалось вставить пароль. Убедитесь, что вы находитесь на странице с полем ввода.'
          }).catch(() => {});
        }
      });
    } catch (error) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Ошибка',
        message: 'Ошибка при генерации пароля: ' + error.message
      }).catch(() => {});
    }
    return;
  }
  
  if (info.menuItemId === 'fill-login-form') {
    if (!tab || !tab.id) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Ошибка',
        message: 'Вкладка недоступна'
      }).catch(() => {});
      return;
    }
    
    function sendFillMessage(attempt = 1) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'fillForm'
      }, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          const errorMessage = error.message || 'Неизвестная ошибка';
          
          if (errorMessage.includes('Could not establish connection') && attempt < 3) {
            setTimeout(() => {
              sendFillMessage(attempt + 1);
            }, 500);
            return;
          }
          
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Ошибка',
            message: errorMessage.includes('Could not establish connection') 
              ? 'Content script не загружен. Перезагрузите страницу и попробуйте снова.'
              : errorMessage
          }).catch(() => {});
          return;
        }
        
        if (response && response.success) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Форма заполнена',
            message: response.message || 'Форма входа успешно заполнена'
          }).catch(() => {});
        } else {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Внимание',
            message: (response && response.message) || 'Не найдено сохранённых паролей для этого сайта'
          }).catch(() => {});
        }
      });
    }
    
    sendFillMessage();
  }
});

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
