/**
 * AppKeyboardBottomSheet — the app's single bottom-sheet shell for sheets that
 * contain text inputs and/or primary action buttons (MODAL-SHEET-01 / KBD-13).
 *
 * Why this exists: every bottom-sheet that had a TextInput previously wired its
 * own keyboard lift, and several lifted by *exactly* the keyboard height (no
 * breathing room) and kept the action buttons INSIDE the scroll content, so on
 * Android edge-to-edge the Cancel/Confirm row sat right on the keyboard edge or
 * behind the system navigation bar. This component standardises the fix:
 *
 *   · keyboard lift uses useKeyboardHeight() — NOT KeyboardAwareScrollView /
 *     react-native-keyboard-controller, which is unreliable inside a RN <Modal>
 *     (the sheet can end up hidden behind the keyboard). See useKeyboardHeight.ts.
 *   · the sheet lifts by the live keyboard height, and the sticky footer keeps a
 *     16px gap above the keyboard when it is open;
 *   · when the keyboard is closed the footer adds insets.bottom + 16 so the
 *     buttons always clear the system navigation bar (Samsung 3-button nav);
 *   · action buttons live in a protected `footer` OUTSIDE the scroll, so they can
 *     never be buried inside scrollable content.
 *
 * The body (`children`) scrolls; the `footer` is pinned. Sheet chrome (overlay,
 * rounded sheet, grab handle) is shared; each caller can still recolour the sheet
 * via `sheetStyle` to match its module.
 */
import React from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { fs } from '../theme/responsive';
import { useResponsive } from '../theme/useResponsive';
import { safeSheetBottom } from '../utils/safeArea';

const GAP = 16; // breathing room above the keyboard / system nav bar

export interface AppKeyboardBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Optional centred title rendered above the scroll body. */
  title?: string;
  /** Scrollable sheet body. */
  children: React.ReactNode;
  /** Pinned action row, kept clear of the keyboard / nav bar. */
  footer?: React.ReactNode;
  /** Tap the dimmed backdrop to close (default true). Pass false while busy. */
  dismissOnBackdrop?: boolean;
  /** Sheet height cap as a viewport fraction (default '88%'). */
  maxHeightPct?: string;
  /** Per-module sheet overrides (background colour, radius, padding). */
  sheetStyle?: StyleProp<ViewStyle>;
  /** Extra style for the scroll content container. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Hide the grab handle (default false). */
  hideHandle?: boolean;
  animationType?: 'slide' | 'fade' | 'none';
}

export const AppKeyboardBottomSheet: React.FC<AppKeyboardBottomSheetProps> = ({
  visible,
  onClose,
  title,
  children,
  footer,
  dismissOnBackdrop = true,
  maxHeightPct = '88%',
  sheetStyle,
  contentStyle,
  hideHandle = false,
  animationType = 'slide',
}) => {
  const kb = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const { height, isTablet } = useResponsive();
  // Footer breathing room: clear the keyboard when open, the nav bar when closed.
  const footerPad = kb > 0 ? GAP : safeSheetBottom(insets.bottom) + GAP;
  const resolvedMaxHeight = isTablet
    ? Math.min(620, Math.round(height * 0.82))
    : maxHeightPct as ViewStyle['maxHeight'];

  return (
    <Modal visible={visible} transparent animationType={animationType} statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* paddingBottom lifts the whole sheet above the keyboard (Android-reliable) */}
      <View style={[s.overlay, isTablet && s.overlayTablet, kb > 0 && { paddingBottom: kb }]}>
        <Pressable style={s.backdrop} onPress={dismissOnBackdrop ? onClose : undefined} />
        <View style={[s.sheet, isTablet && s.sheetTablet, { maxHeight: resolvedMaxHeight }, sheetStyle]}>
          {!hideHandle && !isTablet && <View style={s.handle} />}
          {title ? <Text style={s.title}>{title}</Text> : null}
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[s.content, contentStyle]}
          >
            {children}
          </ScrollView>
          {footer ? <View style={[s.footer, { paddingBottom: footerPad }]}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  overlayTablet: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet:    { backgroundColor: '#FAF3DE', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 12 },
  sheetTablet: { width: '100%', maxWidth: 560, borderRadius: 24 },
  handle:   { width: 36, height: 4, borderRadius: 999, backgroundColor: '#D9CDB4', alignSelf: 'center', marginBottom: 14 },
  title:    { fontSize: fs(16, 14, 18), fontWeight: '800', color: '#1A2540', textAlign: 'center', marginBottom: 14 },
  content:  { paddingBottom: 4 },
  footer:   { paddingTop: 12 },
});
