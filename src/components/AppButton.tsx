import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
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
}

export const AppButton: React.FC<Props> = ({
  label, onPress, variant = 'primary', disabled = false, loading = false, style, textStyle, icon,
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
    >
      {loading
        ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.primaryBlue} size="small" />
        : <Text
            style={[styles.text, styles[`${variant}Text` as keyof typeof styles] as TextStyle, isDisabled && styles.disabledText, textStyle]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {icon ? `${icon}  ${label}` : label}
          </Text>
      }
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
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
