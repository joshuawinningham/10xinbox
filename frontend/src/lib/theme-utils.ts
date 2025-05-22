import { themes, type Theme } from './themes';

export function applyTheme(themeName: string) {
  const theme = themes.find((t) => t.name === themeName);
  if (!theme) return;

  const root = document.documentElement;
  const isDark = document.documentElement.classList.contains('dark');
  const colors = isDark ? theme.colors.dark : theme.colors.light;

  // Apply all theme colors
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });

  // Set border and ring colors based on the theme
  root.style.setProperty('--border', colors.muted);
  root.style.setProperty('--ring', colors.primary);

  // Store the theme preference
  localStorage.setItem('theme', themeName);
}