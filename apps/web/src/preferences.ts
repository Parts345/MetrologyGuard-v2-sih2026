export type ThemePreference = "light" | "dark" | "system";

export type AccessibilityPreferences = {
  largerText: boolean;
  highContrast: boolean;
  largerButtons: boolean;
  reducedMotion: boolean;
};

export type InspectionPreferences = {
  showOcrConfidence: boolean;
  showEvidenceDetails: boolean;
};

export const defaultAccessibility: AccessibilityPreferences = {
  largerText: false,
  highContrast: false,
  largerButtons: false,
  reducedMotion: false,
};

export const defaultInspectionPreferences: InspectionPreferences = {
  showOcrConfidence: true,
  showEvidenceDetails: true,
};

export function readTheme(): ThemePreference {
  const value = localStorage.getItem("metrologyguard-theme");
  return value === "dark" || value === "system" ? value : "light";
}

export function readPreferences<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? { ...fallback as object, ...JSON.parse(stored) } as T : fallback;
  } catch {
    return fallback;
  }
}

export function setDocumentTheme(theme: ThemePreference) {
  const resolved = theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = theme;
}

export function setThemePreference(theme: ThemePreference) {
  localStorage.setItem("metrologyguard-theme", theme);
  setDocumentTheme(theme);
  broadcastPreferences();
}

export function applyAccessibility(preferences: AccessibilityPreferences) {
  const active = Object.entries(preferences).filter(([, enabled]) => enabled).map(([key]) => key).join(" ");
  document.documentElement.dataset.accessibility = active;
}

export function broadcastPreferences() {
  window.dispatchEvent(new Event("metrologyguard-preferences-change"));
}
