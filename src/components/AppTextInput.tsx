/**
 * AppTextInput — drop-in replacement for react-native's TextInput.
 *
 * Keyboard avoidance is handled globally by the keyboard-controller stack
 * (KeyboardProvider + AppKeyboardScrollView), so the focused field is always
 * lifted above the keyboard on iOS and Android. There is NO floating "Done" bar:
 *
 *   • MULTILINE → returnKeyType 'default' + blurOnSubmit:false, so Return inserts
 *                 a newline and never submits/dismisses. Dismiss the keyboard by
 *                 scrolling (keyboardDismissMode="on-drag") or tapping outside.
 *   • SINGLE-LINE → left exactly as the screen configured it, so the keyboard's
 *                 native return / Done / Search key dismisses on submit (the
 *                 standard behaviour).
 *
 * Use this instead of raw TextInput everywhere; a guard test enforces it.
 */
import React, { forwardRef } from 'react';
import { TextInput, TextInputProps } from 'react-native';

export const AppTextInput = forwardRef<TextInput, TextInputProps>((props, ref) => {
  // Only multiline notes need normalising — keep Return as a newline rather than
  // a submit, overriding any per-screen returnKeyType="done"/blurOnSubmit.
  const normalise: Partial<TextInputProps> | null = props.multiline
    ? { blurOnSubmit: false, returnKeyType: 'default' }
    : null;
  return (
    <TextInput
      ref={ref}
      {...props}
      {...normalise}
    />
  );
});

AppTextInput.displayName = 'AppTextInput';
