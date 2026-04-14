// ============================================================
// VITALYZE THEME SYSTEM
// lightTheme = default / dark-on-light
// darkTheme  = deep navy dark mode
// ============================================================

export const lightTheme = {
  isDark: false,

  // Brand
  primary:         '#6C47FF',
  primaryLight:    '#EDE9FF',
  primaryDark:     '#4B2FCC',
  // primaryContrast = readable primary-hue text on any bg in this theme
  primaryContrast: '#6C47FF',   // same as primary in light (fine on light bg)

  // Health Risk Levels
  low:         '#22C55E',
  lowLight:    '#DCFCE7',
  medium:      '#F59E0B',
  mediumLight: '#FEF3C7',
  high:        '#EF4444',
  highLight:   '#FEE2E2',

  // Domain
  mental:        '#A855F7',
  mentalLight:   '#F3E8FF',
  physical:      '#14B8A6',
  physicalLight: '#CCFBF1',
  diet:          '#F97316',
  dietLight:     '#FFEDD5',

  // Section accent colors used on InsightsScreen
  physicalAccent: '#0F6E56',   // dark teal — good contrast on light card
  mentalAccent:   '#7C3AED',   // deep purple — good contrast on light card
  suggestAccent:  '#BA7517',   // dark amber — good contrast on light card

  // Neutrals
  background:  '#F8F9FA',
  surface:     '#FFFFFF',
  border:      '#E5E7EB',
  borderLight: '#F3F4F6',

  // Text
  textPrimary:   '#111827',
  textSecondary: '#6B7280',
  textTertiary:  '#9CA3AF',
  textInverse:   '#FFFFFF',   // text on primary/error/colored button backgrounds

  // States
  info:         '#3B82F6',
  infoLight:    '#DBEAFE',
  success:      '#22C55E',
  successLight: '#DCFCE7',
  warning:      '#F59E0B',
  warningLight: '#FEF3C7',
  error:        '#EF4444',
  errorLight:   '#FEE2E2',

  // Mood
  moodVeryLow: '#EF4444',
  moodLow:     '#F97316',
  moodNeutral: '#F59E0B',
  moodGood:    '#84CC16',
  moodGreat:   '#22C55E',

  // Chart
  chartGrid: '#E5E7EB',
  chartLine: '#6C47FF',

  // Shadows
  shadow:       'rgba(0,0,0,0.06)',
  shadowMedium: 'rgba(0,0,0,0.10)',
};

export const darkTheme = {
  isDark: true,

  // Brand — same vibrant purple for backgrounds; bright variant for text
  primary:         '#6C47FF',
  primaryLight:    '#2D1F66',   // dark purple tint (used as chip/badge bg)
  primaryDark:     '#4B2FCC',
  // primaryContrast — bright enough to read on any dark surface or primaryLight bg
  // #A882FF on #1A1A2E: contrast ≈ 4.8:1 ✓  on #242436: ≈ 4.5:1 ✓  on #2D1F66: ≈ 5.5:1 ✓
  primaryContrast: '#A882FF',

  // Health Risk Levels — foreground colors stay vibrant; tint backgrounds go dark
  low:         '#22C55E',
  lowLight:    '#0F3B20',    // dark green tint
  medium:      '#F59E0B',
  mediumLight: '#3B2900',    // dark amber tint
  high:        '#EF4444',
  highLight:   '#3B0F0F',    // dark red tint

  // Domain — foreground stays vibrant; tint backgrounds go dark
  mental:        '#A855F7',
  mentalLight:   '#2D1F4D',  // dark purple tint
  physical:      '#14B8A6',
  physicalLight: '#0F3B35',  // dark teal tint
  diet:          '#F97316',
  dietLight:     '#3B1F0D',  // dark orange tint

  // Section accent colors for InsightsScreen — lightened for dark bg readability
  // physicalAccent #1D9E75 on #242436: contrast ≈ 5.1:1 ✓
  // mentalAccent   #A878F8 on #242436: contrast ≈ 4.9:1 ✓
  // suggestAccent  #D4921F on #242436: contrast ≈ 5.2:1 ✓
  physicalAccent: '#1D9E75',
  mentalAccent:   '#A878F8',
  suggestAccent:  '#D4921F',

  // Neutrals — deep navy palette
  background:  '#1A1A2E',    // deep navy background
  surface:     '#242436',    // card surface — slightly lighter than bg
  border:      '#2E2E4E',
  borderLight: '#1E1E38',    // input fills / subtle chips

  // Text — off-white hierarchy
  // textPrimary   #F0F0F0 on #1A1A2E: ≈ 14.5:1 ✓  on #242436: ≈ 11.0:1 ✓
  // textSecondary #A0A0B8 on #1A1A2E: ≈  7.2:1 ✓  on #242436: ≈  5.5:1 ✓
  // textTertiary  #706890 on #1A1A2E: ≈  3.8:1 ✓  (placeholder / hint only)
  textPrimary:   '#F0F0F0',   // headings + body text
  textSecondary: '#A0A0B8',   // secondary labels, captions
  textTertiary:  '#706890',   // placeholder / hint text
  textInverse:   '#FFFFFF',   // text ON colored button backgrounds (primary, error, etc.)

  // States — same foreground, dark tint backgrounds
  info:         '#3B82F6',
  infoLight:    '#0F1F3D',
  success:      '#22C55E',
  successLight: '#0F3B20',
  warning:      '#F59E0B',
  warningLight: '#3B2900',
  error:        '#EF4444',
  errorLight:   '#3B0F0F',

  // Mood — same semantic colors (all high-luminance on dark bgs — fine)
  moodVeryLow: '#EF4444',
  moodLow:     '#F97316',
  moodNeutral: '#F59E0B',
  moodGood:    '#84CC16',
  moodGreat:   '#22C55E',

  // Chart
  chartGrid: '#2E2E42',
  chartLine: '#A882FF',       // brighter in dark so bars are visible

  // Shadows — more pronounced on dark backgrounds
  shadow:       'rgba(0,0,0,0.30)',
  shadowMedium: 'rgba(0,0,0,0.50)',
};
