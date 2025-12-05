function checkPasswordStrength(password) {
  if (!password || password.length === 0) {
    return {
      strength: 0,
      score: 0,
      label: '',
      color: '',
      suggestions: []
    };
  }
  
  let score = 0;
  const suggestions = [];
  
  // Длина пароля
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (password.length >= 20) score += 1;
  
  if (password.length < 8) {
    suggestions.push('Используйте минимум 8 символов');
  } else if (password.length < 12) {
    suggestions.push('Рекомендуется использовать минимум 12 символов');
  }
  
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);
  
  if (hasLowercase) score += 1;
  if (hasUppercase) score += 1;
  if (hasNumbers) score += 1;
  if (hasSpecial) score += 1;
  
  if (!hasLowercase) {
    suggestions.push('Добавьте строчные буквы');
  }
  if (!hasUppercase) {
    suggestions.push('Добавьте заглавные буквы');
  }
  if (!hasNumbers) {
    suggestions.push('Добавьте цифры');
  }
  if (!hasSpecial) {
    suggestions.push('Добавьте специальные символы');
  }
  
  const hasRepeating = /(.)\1{2,}/.test(password);
  if (hasRepeating) {
    score -= 1;
    suggestions.push('Избегайте повторяющихся символов');
  }
  
  const hasSequential = /(012|123|234|345|456|567|678|789|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(password);
  if (hasSequential) {
    score -= 1;
    suggestions.push('Избегайте последовательностей символов');
  }
  
  const commonPatterns = [
    /password/i,
    /123456/,
    /qwerty/i,
    /admin/i,
    /letmein/i,
    /welcome/i,
    /monkey/i,
    /dragon/i
  ];
  
  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      score -= 2;
      suggestions.push('Избегайте распространённых слов и паттернов');
      break;
    }
  }
  
  const charTypes = [hasLowercase, hasUppercase, hasNumbers, hasSpecial].filter(Boolean).length;
  if (charTypes === 1) {
    score -= 1;
    suggestions.push('Используйте разные типы символов');
  }
  
  score = Math.max(0, Math.min(10, score));
  
  let strength, label, color;
  
  if (score <= 2) {
    strength = 1;
    label = 'Очень слабый';
    color = '#f5576c';
  } else if (score <= 4) {
    strength = 2;
    label = 'Слабый';
    color = '#ff9800';
  } else if (score <= 6) {
    strength = 3;
    label = 'Средний';
    color = '#ffc107';
  } else if (score <= 8) {
    strength = 4;
    label = 'Сильный';
    color = '#4caf50';
  } else {
    strength = 5;
    label = 'Очень сильный';
    color = '#2196f3';
  }
  
  return {
    strength,
    score,
    label,
    color,
    suggestions: suggestions.slice(0, 3)
  };
}

async function findDuplicatePasswords(passwords) {
  const passwordMap = new Map();
  const duplicates = [];
  
  for (const pwd of passwords) {
    if (!pwd.password) continue;
    
    if (!passwordMap.has(pwd.password)) {
      passwordMap.set(pwd.password, []);
    }
    
    passwordMap.get(pwd.password).push({
      domain: pwd.domain,
      username: pwd.username,
      url: pwd.url
    });
  }
  
  for (const [password, entries] of passwordMap.entries()) {
    if (entries.length > 1) {
      duplicates.push({
        password: password.substring(0, 3) + '***',
        count: entries.length,
        entries: entries
      });
    }
  }
  
  return duplicates;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    checkPasswordStrength,
    findDuplicatePasswords
  };
}
