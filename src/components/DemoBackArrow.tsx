import React from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  color?: string;
};

export const DemoBackArrow: React.FC<Props> = ({ color = colors.card }) => {
  return (
    <View
      testID="demo-aware-back-arrow"
      style={[styles.backArrow, I18nManager.isRTL && styles.rtl]}
    >
      <View style={[styles.arrowDiag1, { backgroundColor: color }]} />
      <View style={[styles.arrowDiag2, { backgroundColor: color }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  backArrow: { width: 11, height: 11, alignItems: 'center', justifyContent: 'center' },
  rtl: { transform: [{ scaleX: -1 }] },
  arrowDiag1: {
    position: 'absolute', width: 8, height: 2, borderRadius: 1,
    top: 2.2, left: 0, transform: [{ rotate: '-45deg' }],
  },
  arrowDiag2: {
    position: 'absolute', width: 8, height: 2, borderRadius: 1,
    bottom: 2.2, left: 0, transform: [{ rotate: '45deg' }],
  },
});
