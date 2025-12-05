const DEFAULT_PASSWORD_SETTINGS = {
  length: 16,
  includeUppercase: true,
  includeLowercase: true,
  includeNumbers: true,
  includeSpecial: true,
  excludeSimilar: true
};

const SIMILAR_CHARS = {
  '0': 'O',
  'O': '0',
  '1': 'lI',
  'l': '1I',
  'I': '1l',
  'o': '0',
  'O': '0'
};

const CHAR_SETS = {
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lowercase: 'abcdefghijkmnopqrstuvwxyz',
  numbers: '23456789',
  special: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

const CHAR_SETS_NO_SIMILAR = {
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lowercase: 'abcdefghijkmnopqrstuvwxyz',
  numbers: '23456789',
  special: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

async function getPasswordGeneratorSettings() {
  try {
    const result = await chrome.storage.local.get(['passwordGeneratorSettings']);
    if (result.passwordGeneratorSettings) {
      return { ...DEFAULT_PASSWORD_SETTINGS, ...result.passwordGeneratorSettings };
    }
    return DEFAULT_PASSWORD_SETTINGS;
  } catch (error) {
    console.error('Ошибка при получении настроек генератора:', error);
    return DEFAULT_PASSWORD_SETTINGS;
  }
}

async function savePasswordGeneratorSettings(settings) {
  try {
    await chrome.storage.local.set({ passwordGeneratorSettings: settings });
    return true;
  } catch (error) {
    console.error('Ошибка при сохранении настроек генератора:', error);
    return false;
  }
}

function generatePassword(settings = null) {
  return new Promise(async (resolve) => {
    const config = settings || await getPasswordGeneratorSettings();
    
    const length = Math.max(8, Math.min(128, config.length || 16));
    const includeUppercase = config.includeUppercase !== false;
    const includeLowercase = config.includeLowercase !== false;
    const includeNumbers = config.includeNumbers !== false;
    const includeSpecial = config.includeSpecial !== false;
    const excludeSimilar = config.excludeSimilar !== false;
    
    if (!includeUppercase && !includeLowercase && !includeNumbers && !includeSpecial) {
      resolve('');
      return;
    }
    
    const charSets = excludeSimilar ? CHAR_SETS_NO_SIMILAR : CHAR_SETS;
    let availableChars = '';
    
    if (includeUppercase) {
      availableChars += charSets.uppercase;
    }
    if (includeLowercase) {
      availableChars += charSets.lowercase;
    }
    if (includeNumbers) {
      availableChars += charSets.numbers;
    }
    if (includeSpecial) {
      availableChars += charSets.special;
    }
    
    if (availableChars.length === 0) {
      resolve('');
      return;
    }
    
    const passwordArray = new Array(length);
    const randomValues = crypto.getRandomValues(new Uint8Array(length));
    
    const requiredChars = [];
    if (includeUppercase) {
      const upperChars = excludeSimilar ? CHAR_SETS_NO_SIMILAR.uppercase : CHAR_SETS.uppercase;
      requiredChars.push(upperChars[Math.floor(Math.random() * upperChars.length)]);
    }
    if (includeLowercase) {
      const lowerChars = excludeSimilar ? CHAR_SETS_NO_SIMILAR.lowercase : CHAR_SETS.lowercase;
      requiredChars.push(lowerChars[Math.floor(Math.random() * lowerChars.length)]);
    }
    if (includeNumbers) {
      const numChars = excludeSimilar ? CHAR_SETS_NO_SIMILAR.numbers : CHAR_SETS.numbers;
      requiredChars.push(numChars[Math.floor(Math.random() * numChars.length)]);
    }
    if (includeSpecial) {
      const specChars = excludeSimilar ? CHAR_SETS_NO_SIMILAR.special : CHAR_SETS.special;
      requiredChars.push(specChars[Math.floor(Math.random() * specChars.length)]);
    }
    
    for (let i = 0; i < length; i++) {
      const randomIndex = randomValues[i] % availableChars.length;
      passwordArray[i] = availableChars[randomIndex];
    }
    
    for (let i = 0; i < requiredChars.length && i < length; i++) {
      const randomPos = Math.floor(Math.random() * length);
      passwordArray[randomPos] = requiredChars[i];
    }
    
    for (let i = passwordArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
    }
    
    resolve(passwordArray.join(''));
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generatePassword,
    getPasswordGeneratorSettings,
    savePasswordGeneratorSettings,
    DEFAULT_PASSWORD_SETTINGS
  };
}
