// TOTP (Time-based One-Time Password) утилита
// Реализация RFC 6238

// Base32 декодирование
function base32Decode(encoded) {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  encoded = encoded.toUpperCase().replace(/=+$/, '');
  
  let bits = 0;
  let value = 0;
  let index = 0;
  const output = new Uint8Array((encoded.length * 5) / 8);
  
  for (let i = 0; i < encoded.length; i++) {
    value = (value << 5) | base32Chars.indexOf(encoded[i]);
    bits += 5;
    
    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  
  return output.slice(0, index);
}

// Декодирование секретного ключа
function decodeSecret(secret) {
  // Удаляем пробелы и форматирование
  secret = secret.replace(/\s+/g, '').toUpperCase();
  
  // Если это base32 строка, декодируем её
  try {
    return base32Decode(secret);
  } catch (e) {
    // Если не base32, пробуем как hex
    const hexMatch = secret.match(/.{1,2}/g);
    if (hexMatch) {
      return new Uint8Array(hexMatch.map(byte => parseInt(byte, 16)));
    }
    throw new Error('Неверный формат секретного ключа');
  }
}

// Генерация HMAC-SHA1
async function hmacSha1(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return new Uint8Array(signature);
}

// Динамическое усечение (RFC 4226)
function dynamicTruncate(hash) {
  const offset = hash[hash.length - 1] & 0x0f;
  const binary = ((hash[offset] & 0x7f) << 24) |
                 ((hash[offset + 1] & 0xff) << 16) |
                 ((hash[offset + 2] & 0xff) << 8) |
                 (hash[offset + 3] & 0xff);
  return binary % 1000000;
}

// Генерация TOTP кода
async function generateTOTP(secret, timeStep = 30, digits = 6) {
  try {
    const key = decodeSecret(secret);
    const counter = Math.floor(Date.now() / 1000 / timeStep);
    
    // Конвертируем counter в 8-байтовый массив (big-endian)
    const counterBytes = new ArrayBuffer(8);
    const counterView = new DataView(counterBytes);
    counterView.setUint32(4, counter, false); // big-endian
    
    // Генерируем HMAC-SHA1
    const hmac = await hmacSha1(key, counterBytes);
    
    // Применяем динамическое усечение
    const code = dynamicTruncate(hmac);
    
    // Форматируем код с нужным количеством цифр
    return code.toString().padStart(digits, '0');
  } catch (error) {
    console.error('Ошибка при генерации TOTP:', error);
    throw new Error('Не удалось сгенерировать TOTP код: ' + error.message);
  }
}

// Получение оставшегося времени до обновления кода
function getTimeRemaining(timeStep = 30) {
  const elapsed = Math.floor(Date.now() / 1000) % timeStep;
  return timeStep - elapsed;
}

// Валидация секретного ключа
function isValidSecret(secret) {
  if (!secret || typeof secret !== 'string') {
    return false;
  }
  
  // Удаляем пробелы
  const cleaned = secret.replace(/\s+/g, '').toUpperCase();
  
  // Проверяем, что это base32 (A-Z, 2-7) или hex
  const base32Pattern = /^[A-Z2-7]+=*$/;
  const hexPattern = /^[0-9A-F]+$/i;
  
  return base32Pattern.test(cleaned) || hexPattern.test(cleaned);
}

// Экспорт функций
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateTOTP,
    getTimeRemaining,
    isValidSecret,
    decodeSecret
  };
}

