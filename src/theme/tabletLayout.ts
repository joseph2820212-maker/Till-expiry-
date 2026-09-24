import { StyleSheet } from 'react-native';

// ─── Tablet "readable width" ────────────────────────────────────────────────────
//
// Single-column screens (Dashboard, forms, simple lists) shouldn't stretch
// edge-to-edge on an iPad. Add `tabletLayout.readable` to a screen's scroll
// `contentContainerStyle` to cap + centre its content. It's a NO-OP on phones
// (they're always narrower than the cap), so it's safe to apply unconditionally.
//
// Split-views and grids manage their own width and do NOT use this — they fill
// the screen.

export const TABLET_READABLE_MAX = 920;

export const tabletLayout = StyleSheet.create({
  readable: { maxWidth: TABLET_READABLE_MAX, width: '100%', alignSelf: 'center' },
});
