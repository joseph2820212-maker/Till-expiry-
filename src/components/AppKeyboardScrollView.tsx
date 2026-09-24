/**
 * AppKeyboardScrollView — the app's single keyboard-aware scroll container.
 *
 * Drop-in replacement for react-native's <ScrollView>, built on
 * react-native-keyboard-controller's <KeyboardAwareScrollView>. It keeps the
 * focused input — and the exact line you're typing, including the 2nd+ line of a
 * multiline note — above the keyboard automatically, with native timing on BOTH
 * iOS and Android. This replaces the old `automaticallyAdjustKeyboardInsets`
 * ScrollView, which is an iOS-only prop and did nothing on Android (so the
 * keyboard covered inputs on Android devices).
 *
 * There is deliberately NO floating "Done" bar: single-line fields dismiss via
 * the keyboard's native return/Done key and multiline notes dismiss by scrolling
 * (keyboardDismissMode="on-drag") or tapping outside — the standard behaviour in
 * large production apps.
 *
 * `bottomOffset` is just a little breathing room between the focused input and
 * the top of the keyboard; screens can override per-case.
 */
import React, { forwardRef } from 'react';
import { KeyboardAwareScrollView, KeyboardAwareScrollViewProps } from 'react-native-keyboard-controller';

// Small gap so the active line sits just clear of the keyboard (no Done bar to
// reserve space for anymore).
const KEYBOARD_GAP = 24;

type KASVRef = React.ElementRef<typeof KeyboardAwareScrollView>;

export const AppKeyboardScrollView = forwardRef<KASVRef, KeyboardAwareScrollViewProps>(
  ({ bottomOffset, keyboardShouldPersistTaps, keyboardDismissMode, ...props }, ref) => (
    <KeyboardAwareScrollView
      ref={ref}
      bottomOffset={bottomOffset ?? KEYBOARD_GAP}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
      // Default: drag-to-dismiss the keyboard (the standard for our sheets/forms).
      // Screens can still override per-case.
      keyboardDismissMode={keyboardDismissMode ?? 'on-drag'}
      {...props}
    />
  ),
);

AppKeyboardScrollView.displayName = 'AppKeyboardScrollView';
