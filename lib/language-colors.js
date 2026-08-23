// Color map for the globe's "language" coloring mode (see #31). Colors loosely
// follow GitHub's linguist palette so they read as familiar at a glance.
// Anything outside this top-15 set falls back to gray.
export const LANGUAGE_COLORS = {
  JavaScript: '#f7df1e',
  TypeScript: '#3178c6',
  Python: '#3572a5',
  Go: '#00add8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  Ruby: '#cc342d',
  PHP: '#4f5d95',
  Swift: '#f05138',
  Kotlin: '#a97bff',
  'C#': '#178600',
  Shell: '#89e051',
  HTML: '#e34c26',
};

export const LANGUAGE_FALLBACK_COLOR = '#94a3b8';

export function getLanguageColor(language) {
  if (!language) return LANGUAGE_FALLBACK_COLOR;
  return LANGUAGE_COLORS[language] || LANGUAGE_FALLBACK_COLOR;
}
