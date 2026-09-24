/**
 * colors.ts — Till family palette (from TillCalc's approved Figma palette)
 *
 * Aesthetic: warm, professional calculator / financial tool.
 *   Navy  = deep primary (#1A2540).
 *   Warm  = paper background (#F7F3E8).
 *   Orange = accent for highlights / CTAs (#E8842D).
 *   Green = success / positive results (#4D8B6E).
 *
 * All existing token names are preserved from the upstream component library.
 * No beige/orange-tinted surface fills — per Figma global cleanup.
 */
export const colors = {
  /* ── Brand ─────────────────────────────────────────── */
  primaryBlue:      '#1A2540',
  deepBlue:         '#1A2540',
  headerBlue:       '#1A2540',

  /* ── Surface ────────────────────────────────────────── */
  background:       '#F7F3E8',   // warm background — app body, editable inputs
  card:             '#FFFDF8',   // card surface
  inputMuted:       '#F0EDE4',   // pale warm tint — unselected pills, auto/calc fields
  rule2:            '#EBE7DE',   // subtle divider — dashed row separators inside cards
  cardWhite:        '#FFFDF8',   // legacy alias → card
  textDark:         '#1A2540',
  textMuted:        '#5B6476',
  textFaint:        '#8A8E9F',   // placeholders / timestamps / disabled
  textLight:        '#FFFDF8',

  /* ── Semantic ───────────────────────────────────────── */
  successGreen:     '#4D8B6E',
  dangerRed:        '#B14D38',
  warningYellow:    '#E8842D',

  /* ── Tints ──────────────────────────────────────────── */
  softBlue:         '#E3E9F3',
  softGreen:        '#DDEDE5',
  softRed:          '#FBE3DE',
  softYellow:       '#E3E9F3',   // → softBlue (no beige surface fills)

  /* ── Tile icon tints (pale blue/green/purple per Figma) ── */
  blueTintBg:       '#E3E9F3',   // → softBlue (was beige)
  blueTintIcon:     '#E8842D',
  blueDeep:         '#1A2540',
  blueSoft:         '#8A98C0',

  /* ── Borders + disabled ─────────────────────────────── */
  border:           '#DDD3BE',
  disabledBg:       '#DDD3BE',
  disabledText:     '#8A8E9F',
  overlayDark:      'rgba(26,37,64,0.5)',

  /* ── Tab bar ────────────────────────────────────────── */
  tabBarActive:     '#1A2540',
  tabBarInactive:   '#8A8E9F',

  /* ── Legacy aliases (kept identical names) ──────────── */
  primaryBlueDark:  '#1A2540',
  primaryBlueLight: '#E3E9F3',   // → softBlue (was beige)
  dangerRedLight:   '#FBE3DE',
  successGreenLight:'#DDEDE5',
  warningYellowLight:'#E3E9F3',  // → softBlue (was beige)
  warningOrange:    '#E8842D',

  /* ── Extended palette (Figma system) ────────────────── */
  navyRaised:       '#2A3856',
  softPurple:       '#ECE6FF',
};
