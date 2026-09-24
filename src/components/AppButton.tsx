import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { rs } from '../theme/responsive';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dangerLink';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: string;
  testID?: string;
}

export const AppButton: React.FC<Props> = ({
  label, onPress, variant = 'primary', disabled = false, loading = false, style, textStyle, icon, testID,
}) => {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], isDisabled && styles.disabled, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
    >
      {loading
        ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.primaryBlue} size="small" />
        : (
          <View style={styles.row}>
            {icon && ICON_NAME.test(icon) ? <Ionicons name={icon as any} size={18} color={isDisabled ? colors.disabledText : ICON_COLOR[variant]} /> : null}
            <Text
              style={[styles.text, styles[`${variant}Text` as keyof typeof styles] as TextStyle, isDisabled && styles.disabledText, textStyle, styles.shrink]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {icon && !ICON_NAME.test(icon) ? `${icon}  ${label}` : label}
            </Text>
          </View>
        )
      }
    </TouchableOpacity>
  );
};

/** An Ionicons name (e.g. "add", "checkmark-done-outline"); anything else (an emoji) is shown as text before the label. */
const ICON_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ICON_COLOR: Record<Variant, string> = {
  primary: '#fff', danger: '#fff', secondary: colors.textDark, outline: colors.primaryBlue, ghost: colors.textMuted, dangerLink: colors.dangerRed,
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  shrink: { flexShrink: 1 },
  base: { paddingVertical: rs(14), paddingHorizontal: rs(20), borderRadius: 14, alignItems: 'center', justifyContent: 'center', minHeight: rs(50) },
  primary: { backgroundColor: colors.primaryBlue, shadowColor: colors.primaryBlue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  secondary: { backgroundColor: colors.cardWhite, borderWidth: 1.5, borderColor: colors.border },
  outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primaryBlue },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.dangerRed },
  dangerLink: { backgroundColor: 'transparent', paddingVertical: 10, minHeight: 36 },
  disabled: { backgroundColor: colors.disabledBg, shadowOpacity: 0, elevation: 0, borderColor: 'transparent' },
  text: { ...typography.buttonText },
  primaryText: { color: '#fff' },
  secondaryText: { color: colors.textDark, fontWeight: '600' },
  outlineText: { color: colors.primaryBlue },
  ghostText: { color: colors.textMuted },
  dangerText: { color: '#fff' },
  dangerLinkText: { color: colors.dangerRed, fontWeight: '600' },
  disabledText: { color: colors.disabledText },
});
