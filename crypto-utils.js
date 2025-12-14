async function deriveKeyFromPin(pin, salt) {
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinData,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const saltBytes = typeof salt === 'string' ? encoder.encode(salt) : salt;
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  return key;
}

async function encryptText(text, pin) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKeyFromPin(pin, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      data
    );
    
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);
    
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Ошибка при шифровании:', error);
    throw new Error('Не удалось зашифровать данные');
  }
}

async function decryptText(encryptedData, pin) {
  try {
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // Поддерживаем только новый формат с солью
    // AES-GCM требует минимум: salt (16) + IV (12) + encrypted data (минимум 16) + auth tag (16)
    if (combined.length < 16 + 12 + 16) {
      throw new Error('Неверный формат зашифрованных данных: недостаточно данных');
    }
    
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 16 + 12);
    const encrypted = combined.slice(16 + 12);
    
    const key = await deriveKeyFromPin(pin, salt);
    
    // AES-GCM автоматически проверяет целостность через authentication tag
    // Если данные повреждены или ключ неверный, будет выброшено исключение
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encrypted
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Ошибка при расшифровке:', error);
    // Не раскрываем детали ошибки для защиты от атак
    if (error.name === 'OperationError' || error.message.includes('decrypt')) {
      throw new Error('Неверный PIN-код или повреждённые данные');
    }
    throw new Error('Ошибка при расшифровке данных');
  }
}

// Генерация временного ключа для pending паролей
async function generateTempKey() {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const encoder = new TextEncoder();
  const keyString = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return keyString;
}

// Шифрование с произвольным ключом (для pending паролей)
async function encryptWithKey(text, keyString) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKeyFromPin(keyString, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      data
    );
    
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);
    
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Ошибка при шифровании с ключом:', error);
    throw new Error('Не удалось зашифровать данные');
  }
}

// Расшифровка с произвольным ключом
async function decryptWithKey(encryptedData, keyString) {
  try {
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    if (combined.length < 16 + 12) {
      throw new Error('Неверный формат зашифрованных данных');
    }
    
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 16 + 12);
    const encrypted = combined.slice(16 + 12);
    
    const key = await deriveKeyFromPin(keyString, salt);
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encrypted
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Ошибка при расшифровке с ключом:', error);
    throw new Error('Неверный ключ или повреждённые данные');
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

const PIN_SALT_LEN = 16;
const PIN_PBKDF2_ITERATIONS = 200000;
const PIN_HASH_VERSION = 'pbkdf2-v1';

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function computePinHash(pin, salt, iterations = PIN_PBKDF2_ITERATIONS) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function savePinHash(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(PIN_SALT_LEN));
  const hashHex = await computePinHash(pin, salt);

  await chrome.storage.local.set({
    pinHash: hashHex,
    pinSalt: bytesToBase64(salt),
    pinHashAlg: PIN_HASH_VERSION,
    pinAttempts: 0,
    pinLockedUntil: null
  });
}

// Защита от timing-атак: постоянное время выполнения
function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    // Имитируем работу для защиты от timing-атак
    const dummy = '0'.repeat(64);
    for (let i = 0; i < dummy.length; i++) {
      dummy.charCodeAt(i) ^ dummy.charCodeAt(i);
    }
    return false;
  }
  
  // Всегда выполняем сравнение одинаковой длины
  const maxLen = Math.max(a.length, b.length);
  let result = 0;
  
  // Сравниваем по максимальной длине для постоянного времени
  for (let i = 0; i < maxLen; i++) {
    const aChar = i < a.length ? a.charCodeAt(i) : 0;
    const bChar = i < b.length ? b.charCodeAt(i) : 0;
    result |= aChar ^ bChar;
  }
  
  // Дополнительная проверка длины для защиты
  if (a.length !== b.length) {
    result |= 1;
  }
  
  return result === 0;
}

async function verifyPin(pin) {
  try {
    const result = await chrome.storage.local.get(['pinHash', 'pinSalt', 'pinHashAlg', 'pinAttempts', 'pinLockedUntil']);

    // Если PIN не установлен, имитируем проверку для защиты от timing-атак
    const storedHash = result.pinHash || '0'.repeat(64);

    if (result.pinLockedUntil && Date.now() < result.pinLockedUntil) {
      const minutesLeft = Math.ceil((result.pinLockedUntil - Date.now()) / 60000);
      throw new Error(`PIN-код заблокирован. Попробуйте через ${minutesLeft} мин.`);
    }

    let isValid = false;

    if (result.pinSalt && result.pinHashAlg === PIN_HASH_VERSION) {
      try {
        const salt = base64ToBytes(result.pinSalt);
        const hashHex = await computePinHash(pin, salt);
        isValid = constantTimeCompare(hashHex, storedHash) && !!result.pinHash;
      } catch (e) {
        isValid = false;
      }
    } else {
      // Legacy SHA-256 без соли
      const encoder = new TextEncoder();
      const data = encoder.encode(pin);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const legacyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      isValid = constantTimeCompare(legacyHash, storedHash) && !!result.pinHash;

      // Миграция на PBKDF2 при успешной проверке
      if (isValid) {
        await savePinHash(pin);
      }
    }

    const attempts = (result.pinAttempts || 0) + (isValid ? 0 : 1);
    const maxAttempts = 5;

    if (isValid) {
      await chrome.storage.local.set({ pinAttempts: 0, pinLockedUntil: null });
      return true;
    }

    if (attempts >= maxAttempts) {
      await chrome.storage.local.set({ 
        passwords: {},
        pendingPasswords: [],
        pendingPasswordsKey: null,
        pinAttempts: attempts,
        pinLockedUntil: null
      });
      throw new Error('Превышено количество попыток. Все пароли удалены в целях безопасности.');
    }

    await chrome.storage.local.set({ pinAttempts: attempts });
    return false;
  } catch (error) {
    if (error.message && (error.message.includes('заблокирован') || error.message.includes('Попробуйте'))) {
      throw error;
    }
    // Имитируем проверку для защиты от timing-атак
    await new Promise(resolve => setTimeout(resolve, 50));
    return false;
  }
}

async function encryptExportData(data, pin) {
  try {
    const encoder = new TextEncoder();
    const jsonData = JSON.stringify(data);
    const dataBytes = encoder.encode(jsonData);
    
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKeyFromPin(pin, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      dataBytes
    );
    
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);
    
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Ошибка при шифровании экспорта:', error);
    throw new Error('Не удалось зашифровать данные для экспорта');
  }
}

async function decryptExportData(encryptedData, pin) {
  try {
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 16 + 12);
    const encrypted = combined.slice(16 + 12);
    
    const key = await deriveKeyFromPin(pin, salt);
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encrypted
    );
    
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decrypted);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Ошибка при расшифровке экспорта:', error);
    throw new Error('Неверный PIN-код или повреждённые данные экспорта');
  }
}

