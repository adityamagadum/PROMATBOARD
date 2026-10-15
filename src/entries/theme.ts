/** Applies the last resolved theme before React mounts, so light-mode users never see a dark flash. */
export function applyCachedTheme() {
  try {
    const t = localStorage.getItem('pv-theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch {
    /* storage unavailable */
  }
}
