const i18n = {
  currentLang: 'ru',
  translations: {
    ru: {
      // Общие
      'general.title': 'Общие',
      'general.subtitle': 'Основные настройки расширения',
      'general.language': 'Язык интерфейса',
      'general.languageSub': 'Выберите язык интерфейса',
      'general.theme': 'Тема оформления',
      'general.themeSub': 'Выберите светлую или темную тему',
      'general.light': 'Светлая',
      'general.dark': 'Тёмная',
      
      // Адаптация
      'accessibility.title': 'Адаптация',
      'accessibility.subtitle': 'Настройки доступности интерфейса',
      'accessibility.epilepsy': 'Для больных эпилепсией',
      'accessibility.epilepsySub': 'Отключает все анимации и упрощает интерфейс',
      'accessibility.fontSize': 'Размер шрифта',
      'accessibility.fontSizeSub': 'Выберите размер шрифта для удобства чтения',
      'accessibility.fontSizeSmall': 'Маленький',
      'accessibility.fontSizeMedium': 'Средний',
      'accessibility.fontSizeLarge': 'Большой',
      'accessibility.fontSizeXLarge': 'Очень большой',
      'accessibility.highContrast': 'Высокий контраст',
      'accessibility.highContrastSub': 'Улучшает видимость для людей с нарушениями зрения',
      'accessibility.reducedMotion': 'Уменьшить движение',
      'accessibility.reducedMotionSub': 'Отключает анимации (следует системным настройкам)',
      'accessibility.focusVisible': 'Видимый фокус',
      'accessibility.focusVisibleSub': 'Всегда показывать индикатор фокуса для клавиатурной навигации',
      
      // Настройки
      'settings.saved': 'Настройки сохранены!',
      'options.saved': 'Настройки сохранены!'
    },
    en: {
      // General
      'general.title': 'General',
      'general.subtitle': 'Main extension settings',
      'general.language': 'Interface Language',
      'general.languageSub': 'Select interface language',
      'general.theme': 'Theme',
      'general.themeSub': 'Select light or dark theme',
      'general.light': 'Light',
      'general.dark': 'Dark',
      
      // Accessibility
      'accessibility.title': 'Accessibility',
      'accessibility.subtitle': 'Interface accessibility settings',
      'accessibility.epilepsy': 'For Epilepsy',
      'accessibility.epilepsySub': 'Disables all animations and simplifies interface',
      'accessibility.fontSize': 'Font Size',
      'accessibility.fontSizeSub': 'Select font size for comfortable reading',
      'accessibility.fontSizeSmall': 'Small',
      'accessibility.fontSizeMedium': 'Medium',
      'accessibility.fontSizeLarge': 'Large',
      'accessibility.fontSizeXLarge': 'Extra Large',
      'accessibility.highContrast': 'High Contrast',
      'accessibility.highContrastSub': 'Improves visibility for people with visual impairments',
      'accessibility.reducedMotion': 'Reduce Motion',
      'accessibility.reducedMotionSub': 'Disables animations (follows system preferences)',
      'accessibility.focusVisible': 'Visible Focus',
      'accessibility.focusVisibleSub': 'Always show focus indicator for keyboard navigation',
      
      // Settings
      'settings.saved': 'Settings saved!',
      'options.saved': 'Settings saved!'
    }
  },
  
  init() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['language'], (result) => {
        this.currentLang = result.language || 'ru';
        resolve();
      });
    });
  },
  
  setLanguage(lang) {
    this.currentLang = lang;
    chrome.storage.sync.set({ language: lang });
  },
  
  t(key) {
    return this.translations[this.currentLang]?.[key] || key;
  },
  
  getCurrentLang() {
    return this.currentLang;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = i18n;
} else {
  window.i18n = i18n;
}

