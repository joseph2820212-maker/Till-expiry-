import { StyleSheet } from 'react-native';
import { colors } from './colors';
export const shadows = StyleSheet.create({
  card: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  button: {
    shadowColor: colors.primaryBlue, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 8, elevation: 5,
  },
});
