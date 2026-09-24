/**
 * Jest mock for react-native-keyboard-controller.
 *
 * The library ships native code (Reanimated/Worklets) that can't load under
 * jest, so — like the other native modules in __mocks__ — we replace it with
 * lightweight passthroughs. Keyboard-aware containers render as plain
 * ScrollView/View; the provider is inert. Tests in this repo read screen source
 * as text, so this mainly guards against any module that transitively imports
 * the library.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';

export const KeyboardProvider = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

export const KeyboardAwareScrollView = React.forwardRef(
  (props: Record<string, unknown>, ref: React.Ref<ScrollView>) =>
    React.createElement(ScrollView, { ref, ...props }),
);
KeyboardAwareScrollView.displayName = 'KeyboardAwareScrollView';

export const KeyboardAvoidingView = ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
  React.createElement(View, props, children);

export const KeyboardStickyView = ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
  React.createElement(View, props, children);

export const KeyboardToolbar = () => null;

export const KeyboardController = { dismiss: () => undefined, setFocusTo: () => undefined };

export default {};
