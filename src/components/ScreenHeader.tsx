import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, I18nManager } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { fs } from '../theme/responsive';
import { HeaderTopBleed } from './HeaderTopBleed';
import { DemoBackArrow } from './DemoBackArrow';

interface ActionSlot {
  icon: string;
  onPress: () => void;
  label: string;
}

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightIcon?: string;
  onRightPress?: () => void;
  rightLabel?: string;
  rightActions?: ActionSlot[];
}

export const ScreenHeader: React.FC<Props> = ({ title, subtitle, onBack, rightIcon, onRightPress, rightLabel, rightActions }) => {
  const { t } = useTranslation();
  const isRtl = I18nManager.isRTL;
  const insets = useSafeAreaInsets();
  // F09.7 (audit): the title is centred, so the two side slots must be the same
  // width whatever sits in them — one back arrow, two actions, or nothing.
  const actionCount = rightActions?.length ?? (rightIcon ? 1 : 0);
  const sideWidth = Math.max(1, actionCount) * SLOT;
  return (
  <View testID="screen-header-container" style={[styles.container, { paddingTop: Math.max(insets.top, 20) }, isRtl && styles.containerRtl]}>
    <HeaderTopBleed color={colors.primaryBlue} />
    <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />

    <View style={[styles.sideBox, { width: sideWidth }]} testID="screen-header-start">
      {onBack ? (
        <TouchableOpacity style={styles.slot} onPress={onBack} activeOpacity={0.7} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <DemoBackArrow />
        </TouchableOpacity>
      ) : null}
    </View>

    <View style={styles.center}>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
    </View>

    <View style={[styles.sideBox, styles.sideBoxEnd, { width: sideWidth }]} testID="screen-header-end">
      {rightActions && rightActions.length > 0 ? rightActions.map((action, i) => (
        <TouchableOpacity key={i} style={styles.slot} onPress={action.onPress} activeOpacity={0.7} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel={action.label}>
          <Text style={styles.rightIcon}>{action.icon}</Text>
        </TouchableOpacity>
      )) : rightIcon ? (
        <TouchableOpacity style={styles.slot} onPress={onRightPress} activeOpacity={0.7} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel={rightLabel || title}>
          <Text style={styles.rightIcon}>{rightIcon}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  </View>
  );
};

/** Touch slot ≥ 44 dp (plus hitSlop) — audit F09.9. */
export const SLOT = 44;
const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primaryBlue,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  containerRtl: { direction: 'rtl' },
  sideBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', minHeight: SLOT },
  sideBoxEnd: { justifyContent: 'flex-end' },
  slot: { width: SLOT, height: SLOT, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, flexShrink: 1, alignItems: 'center' },
  title: { ...typography.screenTitle, color: '#fff', letterSpacing: -0.2, textAlign: 'center' },
  subtitle: { ...typography.bodySm, color: 'rgba(255,255,255,0.8)', marginTop: 2, textAlign: 'center' },
  rightIcon: { fontSize: fs(20, 17, 23), color: '#fff' },
});
