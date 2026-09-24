import React from 'react';
import {
  View, Text, ScrollView,
  StyleSheet, ViewStyle, TextStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { fs } from '../theme/responsive';
import { layout } from '../theme/layout';
import { TABLET_READABLE_MAX } from '../theme/tabletLayout';
import { useKeyboardMode } from '../hooks/useKeyboardMode';
import { safeBottom } from '../utils/safeArea';

// Re-export the canonical button from AppButton.tsx — one button system only.
export { AppButton } from './AppButton';

// ─── AppCard ──────────────────────────────────────────────────────────────────

interface AppCardProps { children: React.ReactNode; style?: ViewStyle; }

export const AppCard: React.FC<AppCardProps> = ({ children, style }) => (
  <View style={[ac.card, style]}>{children}</View>
);

const ac = StyleSheet.create({
  card: {
    backgroundColor: colors.cardWhite, borderRadius: radius.card,
    padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
});

// ─── AppSectionTitle ──────────────────────────────────────────────────────────

interface AppSectionTitleProps { children: string; style?: TextStyle; }

export const AppSectionTitle: React.FC<AppSectionTitleProps> = ({ children, style }) => (
  <Text style={[ast.title, style]}>{children}</Text>
);

const ast = StyleSheet.create({
  title: { fontSize: fs(18, 15, 21), fontWeight: '800', color: colors.textDark, marginBottom: 10, letterSpacing: -0.2 },
});

// ─── useKeyboardVisible ───────────────────────────────────────────────────────
// Back-compat alias for the canonical, flicker-free hook. There is ONE keyboard
// signal in the app (useKeyboardMode) — screens should rely on AppBottomActions
// (which already uses it) rather than gating the bar themselves.

export const useKeyboardVisible = useKeyboardMode;

// ─── AppBottomActions ─────────────────────────────────────────────────────────

const BottomTabBarVisibleContext = React.createContext(false);

export const AppBottomTabBarVisibilityProvider: React.FC<{
  children: React.ReactNode;
  visible: boolean;
}> = ({ children, visible }) => (
  <BottomTabBarVisibleContext.Provider value={visible}>
    {children}
  </BottomTabBarVisibleContext.Provider>
);

type BottomActionPlacement = 'auto' | 'above-tabs' | 'device-edge';

function useBottomActionPlacement(placement: BottomActionPlacement) {
  const contextTabBarVisible = React.useContext(BottomTabBarVisibleContext);
  const tabBarVisible = placement === 'auto'
    ? contextTabBarVisible
    : placement === 'above-tabs';
  const insets = useSafeAreaInsets();
  const deviceInset = safeBottom(insets.bottom);
  return {
    actionPaddingBottom: tabBarVisible
      ? layout.bottomActions.aboveTabBarPaddingBottom
      : layout.bottomActions.deviceEdgePaddingBottom + deviceInset,
    contentGapInset: tabBarVisible ? 0 : deviceInset,
  };
}

interface AppBottomActionsProps { children: React.ReactNode; row?: boolean; style?: ViewStyle; placement?: BottomActionPlacement; }

export const AppBottomActions: React.FC<AppBottomActionsProps> = ({ children, row, style, placement = 'auto' }) => {
  const keyboardActive = useKeyboardMode();
  const { actionPaddingBottom } = useBottomActionPlacement(placement);
  if (keyboardActive) return null;
  return (
    <View
      style={[
        aba.container,
        { paddingBottom: actionPaddingBottom },
        style,
      ]}
    >
      <View style={[aba.inner, row && aba.row]}>
        {children}
      </View>
    </View>
  );
};

const aba = StyleSheet.create({
  container: {
    paddingTop: layout.bottomActions.paddingTop,
    backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  inner: {
    width: '100%',
    maxWidth: TABLET_READABLE_MAX,
    alignSelf: 'center',
    paddingHorizontal: layout.bottomActions.paddingHorizontal,
    gap: layout.bottomActions.gap,
  },
  row: { flexDirection: 'row' },
});

// ─── AppBottomContentGap ──────────────────────────────────────────────────────
// Spacer placed at the end of a ScrollView's content so the last items clear
// the AppBottomActions bar. Matches the Daily Book standard (height: 100).
// Outside a visible tab bar it grows by the device-safe inset.

export const AppBottomContentGap: React.FC<{ placement?: BottomActionPlacement }> = ({ placement = 'auto' }) => {
  const { contentGapInset } = useBottomActionPlacement(placement);
  return <View style={{ height: layout.bottomActions.contentGap + contentGapInset }} />;
};

// ─── AppFieldError ─────────────────────────────────────────────────────────────

interface AppFieldErrorProps { message?: string; }

export const AppFieldError: React.FC<AppFieldErrorProps> = ({ message }) =>
  message ? <Text style={fe.text}>{message}</Text> : null;

const fe = StyleSheet.create({
  text: { fontSize: fs(12, 11, 13), color: colors.dangerRed, marginTop: 4, marginBottom: 2 },
});

// ─── AppScreen ────────────────────────────────────────────────────────────────

interface AppScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  bottomPadding?: number;
  style?: ViewStyle;
}

export const AppScreen: React.FC<AppScreenProps> = ({
  children, scroll = true, bottomPadding = 24, style,
}) => {
  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={[{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: bottomPadding }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingHorizontal: 16 }, style]}>{children}</View>
  );

  return (
    <SafeAreaView style={[as.safe, style]} edges={['top']}>
      {inner}
    </SafeAreaView>
  );
};

const as = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
});
