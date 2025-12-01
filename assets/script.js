/*
 * Custom JavaScript for Junhao Wang's personal website.
 *
 * Handles the dark/light theme toggling.
 */

const THEME_STORAGE_KEY = 'theme';
const FONT_STORAGE_KEY = 'font';
const DEFAULT_THEME = 'dark';
const DEFAULT_FONT = 'default';
const FONT_PRESETS = new Set(['default', 'grotesk', 'mono', 'tech']);
const LEGACY_FONT_MAP = {
  modern: 'default',
  default: 'default',
  editorial: 'grotesk',
  airy: 'grotesk',
  mono: 'mono',
};

function updateThemeToggleButton(currentTheme) {
  const button = document.getElementById('theme-toggle');
  if (!button) return;
  button.textContent = currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

function applyFontPreset(preset, options = {}) {
  const { persist = false } = options;
  const mappedPreset = LEGACY_FONT_MAP[preset] || preset;
  const finalPreset = FONT_PRESETS.has(mappedPreset) ? mappedPreset : DEFAULT_FONT;
  document.body.setAttribute('data-font', finalPreset);
  const select = document.getElementById('font-select');
  if (select && select.value !== finalPreset) {
    select.value = finalPreset;
  }
  if (persist) {
    localStorage.setItem(FONT_STORAGE_KEY, finalPreset);
  }
}

// Theme toggle logic
function toggleTheme() {
  const body = document.body;
  const currentTheme = body.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  body.setAttribute('data-theme', newTheme);
  localStorage.setItem(THEME_STORAGE_KEY, newTheme);
  // Update toggle button label based on current theme
  updateThemeToggleButton(newTheme);
}

// Initialise theme on page load based on saved preference
document.addEventListener('DOMContentLoaded', () => {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const initialTheme = storedTheme === 'dark' ? 'dark' : DEFAULT_THEME;
  document.body.setAttribute('data-theme', initialTheme);
  updateThemeToggleButton(initialTheme);

  const fontSelect = document.getElementById('font-select');
  if (fontSelect) {
    const storedFont = localStorage.getItem(FONT_STORAGE_KEY);
    const normalisedStoredFont = LEGACY_FONT_MAP[storedFont] || storedFont;
    const initialFont = FONT_PRESETS.has(normalisedStoredFont) ? normalisedStoredFont : DEFAULT_FONT;
    applyFontPreset(initialFont);
    fontSelect.value = initialFont;
    fontSelect.addEventListener('change', (event) => {
      const nextPreset = event.target.value;
      applyFontPreset(nextPreset, { persist: true });
    });
  } else {
    // Ensure default font when no selector is present
    document.body.setAttribute('data-font', DEFAULT_FONT);
  }

  // Subtle background parallax on scroll
  const PARALLAX_FACTOR = 0.04; // very slight pan
  let ticking = false;
  function updateParallax() {
    const y = window.scrollY || window.pageYOffset || 0;
    document.body.style.setProperty('--bg-offset-y', `${-y * PARALLAX_FACTOR}px`);
    ticking = false;
  }
  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  updateParallax();
});
