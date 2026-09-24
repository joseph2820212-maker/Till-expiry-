import React from 'react';
import { Text, TextStyle, StyleSheet, StyleProp } from 'react-native';
import { currencyAfter, useCurrencySymbol } from '../utils/currency';
import { groupNumber } from '../utils/locale';
import { numberFontFamily } from '../theme/numberFont';
import i18n from '../i18n';

interface Props {
  amount: number | null | undefined;
  sign?: '' | '+' | '-';
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}

export const AmountText: React.FC<Props> = ({
  amount, sign = '', style, numberOfLines, adjustsFontSizeToFit, minimumFontScale,
}) => {
  const val = (amount == null || isNaN(amount as number) || !isFinite(amount as number)) ? 0 : (amount as number);
  const sym = useCurrencySymbol();
  // Whole amounts drop the ".00"; amounts with cents keep 2 decimals.
  const whole = Math.round(Math.abs(val) * 100) % 100 === 0;
  const numStr = groupNumber(Math.abs(val), whole ? 0 : 2, 2);
  const signed = sign ? `${sign}${numStr}` : numStr;
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const baseFontSize = flat?.fontSize ?? 16;
  // Numbers render in the IBM Plex Sans Arabic face matching the caller's weight.
  const fam = numberFontFamily(flat?.fontWeight ?? '700');
  const fontGuardStyle: TextStyle = { fontFamily: fam };
  // Arabic currency tokens are set smaller than the figure so the number stays dominant.
  const shrinkArabicPaidSymbol = i18n.language === 'ar';
  const symStyle: TextStyle = { fontSize: shrinkArabicPaidSymbol ? Math.round(baseFontSize * 0.55) : baseFontSize, ...fontGuardStyle };

  if (currencyAfter()) {
    return (
      <Text style={[style, fontGuardStyle]} numberOfLines={numberOfLines} adjustsFontSizeToFit={adjustsFontSizeToFit} minimumFontScale={minimumFontScale}>
        {signed}<Text style={symStyle}> {sym}</Text>
      </Text>
    );
  }
  return (
    <Text style={[style, fontGuardStyle]} numberOfLines={numberOfLines} adjustsFontSizeToFit={adjustsFontSizeToFit} minimumFontScale={minimumFontScale}>
      {sign ? sign : ''}<Text style={symStyle}>{sym}</Text>{numStr}
    </Text>
  );
};
