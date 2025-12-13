// Утилиты для работы с WebAuthn (биометрическая аутентификация)

const WEBAUTHN_RP_ID = 'localhost'; // Для расширений используем localhost
const WEBAUTHN_RP_NAME = 'TOTC Pass';

/**
 * Проверяет, поддерживается ли WebAuthn в браузере
 */
function isWebAuthnSupported() {
  return typeof window !== 'undefined' && 
         typeof window.PublicKeyCredential !== 'undefined' &&
         typeof navigator.credentials !== 'undefined' &&
         typeof navigator.credentials.create !== 'undefined' &&
         typeof navigator.credentials.get !== 'undefined';
}

/**
 * Регистрирует новый биометрический ключ
 * @param {string} userId - Уникальный идентификатор пользователя
 * @param {string} userName - Имя пользователя
 * @returns {Promise<Object>} Объект с публичным ключом и другими данными
 */
async function registerBiometric(userId, userName) {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn не поддерживается в вашем браузере');
  }

  try {
    // Генерируем случайный challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    // Создаём публичный ключ для регистрации
    const publicKeyCredentialCreationOptions = {
      challenge: challenge,
      rp: {
        id: WEBAUTHN_RP_ID,
        name: WEBAUTHN_RP_NAME,
      },
      user: {
        id: new TextEncoder().encode(userId),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Встроенный аутентификатор (Windows Hello, Touch ID и т.д.)
        userVerification: 'required',
        requireResidentKey: false,
      },
      timeout: 60000,
      attestation: 'none',
    };

    // Создаём учётные данные
    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    });

    if (!credential) {
      throw new Error('Не удалось создать биометрические учётные данные');
    }

    // Преобразуем данные в формат для хранения
    const publicKeyCredential = {
      id: arrayBufferToBase64(credential.rawId),
      response: {
        clientDataJSON: arrayBufferToBase64(credential.response.clientDataJSON),
        attestationObject: arrayBufferToBase64(credential.response.attestationObject),
      },
      type: credential.type,
    };

    // Сохраняем challenge для проверки
    const challengeBase64 = arrayBufferToBase64(challenge);
    
    return {
      credential: publicKeyCredential,
      challenge: challengeBase64,
    };
  } catch (error) {
    console.error('Ошибка при регистрации биометрии:', error);
    if (error.name === 'NotAllowedError') {
      throw new Error('Регистрация биометрии была отменена пользователем');
    } else if (error.name === 'NotSupportedError') {
      throw new Error('Биометрическая аутентификация не поддерживается на этом устройстве');
    } else if (error.name === 'InvalidStateError') {
      throw new Error('Биометрические учётные данные уже зарегистрированы');
    } else {
      throw new Error('Ошибка при регистрации биометрии: ' + error.message);
    }
  }
}

/**
 * Аутентифицирует пользователя с помощью биометрии
 * @param {string} credentialId - ID зарегистрированного ключа
 * @returns {Promise<Object>} Результат аутентификации
 */
async function authenticateBiometric(credentialId) {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn не поддерживается в вашем браузере');
  }

  try {
    // Проверяем, что окно браузера активно
    if (typeof document !== 'undefined' && document.hidden) {
      throw new Error('Окно браузера не активно');
    }

    // Генерируем случайный challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    // Параметры для аутентификации
    const publicKeyCredentialRequestOptions = {
      challenge: challenge,
      rpId: WEBAUTHN_RP_ID,
      allowCredentials: [
        {
          id: base64ToArrayBuffer(credentialId),
          type: 'public-key',
        },
      ],
      userVerification: 'required',
      timeout: 60000,
    };

    // Получаем учётные данные
    // Обертываем в try-catch для обработки ошибок окна
    let assertion;
    try {
      assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      });
    } catch (credError) {
      // Обрабатываем специфичные ошибки
      if (credError.message && credError.message.includes('active browser window')) {
        throw new Error('Could not find an active browser window');
      }
      throw credError;
    }

    if (!assertion) {
      throw new Error('Аутентификация не удалась');
    }

    // Преобразуем данные для проверки
    const assertionData = {
      id: arrayBufferToBase64(assertion.rawId),
      response: {
        clientDataJSON: arrayBufferToBase64(assertion.response.clientDataJSON),
        authenticatorData: arrayBufferToBase64(assertion.response.authenticatorData),
        signature: arrayBufferToBase64(assertion.response.signature),
        userHandle: assertion.response.userHandle ? arrayBufferToBase64(assertion.response.userHandle) : null,
      },
      type: assertion.type,
    };

    const challengeBase64 = arrayBufferToBase64(challenge);

    return {
      assertion: assertionData,
      challenge: challengeBase64,
    };
  } catch (error) {
    console.error('Ошибка при аутентификации биометрии:', error);
    if (error.name === 'NotAllowedError') {
      throw new Error('Аутентификация была отменена пользователем');
    } else if (error.name === 'InvalidStateError') {
      throw new Error('Биометрические учётные данные не найдены');
    } else if (error.name === 'NotFoundError') {
      throw new Error('Биометрические учётные данные не найдены. Настройте биометрию заново.');
    } else if (error.message && error.message.includes('active browser window')) {
      throw new Error('Could not find an active browser window');
    } else {
      throw new Error('Ошибка при аутентификации: ' + error.message);
    }
  }
}

/**
 * Проверяет, зарегистрирована ли биометрия
 * @returns {Promise<boolean>}
 */
async function isBiometricRegistered() {
  try {
    const result = await chrome.storage.local.get(['biometricCredentialId']);
    return !!result.biometricCredentialId;
  } catch (error) {
    console.error('Ошибка при проверке регистрации биометрии:', error);
    return false;
  }
}

/**
 * Сохраняет данные биометрической регистрации
 * @param {string} credentialId - ID учётных данных
 * @param {Object} credentialData - Данные учётных данных
 */
async function saveBiometricData(credentialId, credentialData) {
  try {
    await chrome.storage.local.set({
      biometricCredentialId: credentialId,
      biometricCredentialData: credentialData,
      biometricEnabled: true,
    });
  } catch (error) {
    console.error('Ошибка при сохранении данных биометрии:', error);
    throw new Error('Не удалось сохранить данные биометрии');
  }
}

/**
 * Удаляет данные биометрической регистрации
 */
async function removeBiometricData() {
  try {
    await chrome.storage.local.remove([
      'biometricCredentialId',
      'biometricCredentialData',
      'biometricEnabled',
    ]);
  } catch (error) {
    console.error('Ошибка при удалении данных биометрии:', error);
    throw new Error('Не удалось удалить данные биометрии');
  }
}

/**
 * Получает ID зарегистрированного биометрического ключа
 * @returns {Promise<string|null>}
 */
async function getBiometricCredentialId() {
  try {
    const result = await chrome.storage.local.get(['biometricCredentialId']);
    return result.biometricCredentialId || null;
  } catch (error) {
    console.error('Ошибка при получении ID биометрии:', error);
    return null;
  }
}

/**
 * Проверяет, включена ли биометрическая аутентификация
 * @returns {Promise<boolean>}
 */
async function isBiometricEnabled() {
  try {
    const result = await chrome.storage.local.get(['biometricEnabled']);
    return result.biometricEnabled === true;
  } catch (error) {
    console.error('Ошибка при проверке настройки биометрии:', error);
    return false;
  }
}

/**
 * Преобразует ArrayBuffer в Base64
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Преобразует Base64 в ArrayBuffer
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
