import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Animated, StyleSheet, I18nManager } from 'react-native';
import { colors } from '../theme/colors';

interface AppSwitchProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
}

/**
 * F09.1 (audit): the thumb's absolute `left` is mirrored by RN in RTL, but a
 * translateX is not — so in RTL the "on" position moves the thumb the other way.
 */
export function getSwitchThumbTranslate(value: boolean, rtl: boolean = I18nManager.isRTL): number {
  if (!value) return 0;
  return rtl ? -20 : 20;
}

export const AppSwitch: React.FC<AppSwitchProps> = ({ value, onValueChange, disabled }) => {
  const translate = useRef(new Animated.Value(getSwitchThumbTranslate(value))).current;
  const bgColor = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translate, { toValue: getSwitchThumbTranslate(value), useNativeDriver: true, damping: 20, stiffness: 250 }),
      Animated.timing(bgColor, { toValue: value ? 1 : 0, duration: 150, useNativeDriver: false }),
    ]).start();
  }, [value, translate, bgColor]);

  const bg = bgColor.interpolate({ inputRange: [0, 1], outputRange: ['#D9CDB4', colors.primaryBlue] });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <Animated.View
        testID="app-switch-track"
        style={{ width: 51, height: 31, borderRadius: 15.5, padding: 2, backgroundColor: bg, opacity: disabled ? 0.45 : 1 }}
      >
        <Animated.View
          testID="app-switch-thumb"
          style={{
            width: 27,
            height: 27,
            borderRadius: 13.5,
            backgroundColor: colors.cardWhite,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(26,37,64,0.18)',
            shadowColor: '#1A2540',
            shadowOpacity: 0.14,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
            position: 'absolute',
            left: 2,
            top: 2,
            transform: [{ translateX: translate }],
          }}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};
