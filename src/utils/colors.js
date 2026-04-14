// ============================================================
// VITALYZE COLOR SYSTEM
// Static light-mode Colors object kept for any legacy import.
// All new code should call useTheme() and use `colors` from there.
// ============================================================

export { lightTheme as Colors } from './themes';

// ── Semantic color helpers ───────────────────────────────────
// getRiskColor / getScoreColor return the same vibrant hues in
// both themes, so they stay as pure functions.

export const getRiskColor = (riskLevel) => {
  switch (riskLevel?.toLowerCase()) {
    case 'low':    return '#22C55E';
    case 'medium': return '#F59E0B';
    case 'high':   return '#EF4444';
    default:       return '#9CA3AF';
  }
};

/**
 * Return the tinted background for a risk level.
 * Pass the current theme's `colors` object so dark mode gets the correct dark tint.
 * Falls back to light-theme values when called without `colors` (legacy call sites).
 */
export const getRiskBgColor = (riskLevel, colors) => {
  const low    = colors?.lowLight    ?? '#DCFCE7';
  const medium = colors?.mediumLight ?? '#FEF3C7';
  const high   = colors?.highLight   ?? '#FEE2E2';
  const def    = colors?.borderLight ?? '#F3F4F6';
  switch (riskLevel?.toLowerCase()) {
    case 'low':    return low;
    case 'medium': return medium;
    case 'high':   return high;
    default:       return def;
  }
};

export const getScoreColor = (score) => {
  if (score >= 70) return '#22C55E';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
};
