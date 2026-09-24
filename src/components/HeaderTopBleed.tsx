import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

type Props = {
  color?: string;
};

export const HeaderTopBleed: React.FC<Props> = ({ color = colors.primaryBlue }) => {
  const insets = useSafeAreaInsets();
  if (insets.top <= 0) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.bleed, { top: -insets.top, height: insets.top, backgroundColor: color }]}
    />
  );
};

const styles = StyleSheet.create({
  bleed: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
