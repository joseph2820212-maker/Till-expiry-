/**
 * Maps a fontWeight to the matching IBM Plex Sans Arabic face name.
 *
 * Fonts are loaded via useFonts in App.tsx BEFORE the main navigator mounts.
 * If loading fails, the app shows a startup error screen — the main UI is
 * never rendered with unregistered font families.
 *
 * These names are evaluated at module-load time by typography.ts and baked
 * into StyleSheet objects, so they cannot be changed at runtime.
 * 800-900 map to 700 (heaviest shipped face).
 */
type FontWeight = string | number | undefined;

export function numberFontFamily(weight?: FontWeight): string {
  const w = weight == null ? '400' : String(weight);
  if (w === '700' || w === '800' || w === '900' || w === 'bold') return 'IBMPlexSansArabic_700Bold';
  if (w === '600') return 'IBMPlexSansArabic_600SemiBold';
  if (w === '500') return 'IBMPlexSansArabic_500Medium';
  return 'IBMPlexSansArabic_400Regular';
}
