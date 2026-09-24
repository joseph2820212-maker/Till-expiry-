/**
 * DatePickerField — tap to open inline calendar; never opens text keyboard.
 *
 * Visual: looks like an input field. Tapping opens a bottom-sheet calendar
 * with month nav. Date format stored is YYYY-MM-DD; display is dd MMM yyyy.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import { fs } from '../theme/responsive';
import { localISODate } from '../utils/safeParse';
import { localizeDigits } from '../utils/locale';
import { numberFontFamily } from '../theme/numberFont';
import { safeSheetBottom } from '../utils/safeArea';

interface DatePickerFieldProps {
  label?: string;
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
  placeholder?: string;
  compact?: boolean; // show dd MMM without year (for tight layouts)
  maxDate?: string; // YYYY-MM-DD; dates after this are disabled
}

function todayISO(): string { return localISODate(); }
function fmt(iso: string, months: string[], compact?: boolean): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return localizeDigits(compact ? `${String(d).padStart(2, '0')} ${months[m-1]}` : `${String(d).padStart(2, '0')} ${months[m-1]} ${y}`);
}
function daysInMonth(y: number, m: number): number { return new Date(y, m, 0).getDate(); }

export const DatePickerField: React.FC<DatePickerFieldProps> = ({
  label, value, onChange, placeholder, compact, maxDate,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  const months = t('common.monthsShort', { returnObjects: true }) as string[];
  const daysShort = t('common.weekdaysShort', { returnObjects: true }) as string[];
  const fieldPlaceholder = placeholder ?? t('common.datePlaceholder');
  const [open, setOpen] = useState(false);
  const seed = value || todayISO();
  const [y, m] = seed.split('-').map(Number);
  const [viewY, setViewY] = useState(y);
  const [viewM, setViewM] = useState(m);

  // Resync the visible calendar month/year when the parent changes the value
  // (e.g. the screen loads a stored date asynchronously after mount).
  useEffect(() => {
    if (!value) return;
    const [vy, vm] = value.split('-').map(Number);
    if (vy && vm) { setViewY(vy); setViewM(vm); }
  }, [value]);

  const effectiveMaxDate = maxDate ?? todayISO();
  const days = daysInMonth(viewY, viewM);
  const firstDow = new Date(viewY, viewM - 1, 1).getDay();
  const blanks = (firstDow + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(blanks).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  const maxMonthReached = `${viewY}-${String(viewM).padStart(2, '0')}` >= effectiveMaxDate.slice(0, 7);
  const bottomInset = safeSheetBottom(insets.bottom);
  const sheetMaxHeight = isTablet
    ? Math.min(620, Math.round(height * 0.85))
    : Math.max(320, height - Math.max(insets.top, 12) - bottomInset - 24);

  return (
    <View style={s.wrap}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TouchableOpacity style={s.field} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <View style={s.calIcon}>
          <View style={s.calTop} />
          <View style={s.calBody}>
            <View style={s.calDot} />
          </View>
        </View>
        <Text style={[s.value, !value && s.placeholder, value && s.valueNum]} numberOfLines={1}>
          {value ? fmt(value, months, compact) : fieldPlaceholder}
        </Text>
        <Ionicons name="chevron-down" size={14} style={s.chev} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={[s.overlay, isTablet && s.overlayCenter]} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity style={[s.sheet, isTablet && s.sheetTablet, { maxHeight: sheetMaxHeight, paddingBottom: isTablet ? 20 : bottomInset + 14 }]} activeOpacity={1} onPress={() => {}}>
            <View style={s.navRow}>
              <TouchableOpacity
                onPress={() => { let nm = viewM - 1, ny = viewY; if (nm < 1) { nm = 12; ny--; } setViewM(nm); setViewY(ny); }}
                style={s.navBtn}
              ><Text style={s.navArrow}>‹</Text></TouchableOpacity>
              <Text style={s.monthLabel}>{months[viewM-1]} {localizeDigits(String(viewY))}</Text>
              <TouchableOpacity
                disabled={maxMonthReached}
                onPress={() => { let nm = viewM + 1, ny = viewY; if (nm > 12) { nm = 1; ny++; } setViewM(nm); setViewY(ny); }}
                style={s.navBtn}
              ><Text style={[s.navArrow, maxMonthReached && s.navArrowDisabled]}>›</Text></TouchableOpacity>
            </View>
            <View style={s.dowRow}>
              {daysShort.map(d => <Text key={d} style={s.dowLabel}>{d}</Text>)}
            </View>
            <View style={s.grid}>
              {cells.map((day, i) => {
                if (!day) return <View key={`b${i}`} style={s.cell} />;
                const iso = `${viewY}-${String(viewM).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const isSel = iso === value;
                const disabled = iso > effectiveMaxDate;
                return (
                  <TouchableOpacity
                    key={iso}
                    style={[s.cell, isSel && s.cellSel]}
                    disabled={disabled}
                    onPress={() => { onChange(iso); setOpen(false); }}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.dayNum, isSel && s.dayNumSel, disabled && s.dayNumDisabled]}>{localizeDigits(String(day))}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setOpen(false)}>
              <Text style={s.cancelTxt}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  wrap: { marginBottom: 4 },
  label: { fontSize: fs(14, 12, 16), fontWeight: '600', color: colors.textDark, marginBottom: 6 },
  field: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardWhite, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, height: 50, gap: 10 },
  calIcon: { width: 18, height: 18, position: 'relative' },
  calTop: { position: 'absolute', top: 0, left: 1, right: 1, height: 4, backgroundColor: colors.primaryBlue, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  calBody: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 12, borderWidth: 1.5, borderColor: '#8A8E9F', borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  calDot: { width: 4, height: 4, backgroundColor: colors.primaryBlue, borderRadius: 1 },
  value: { flex: 1, fontSize: fs(15, 13, 17), color: colors.textDark },
  valueNum: { fontFamily: numberFontFamily('400') },
  placeholder: { color: '#4A5570' },
  chev: { fontSize: fs(14, 12, 16), color: '#4A5570' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  overlayCenter: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  sheet: { backgroundColor: '#FAF3DE', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 36 },
  sheetTablet: { width: '100%', maxWidth: 460, borderRadius: 22 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: fs(22, 18, 26), color: colors.primaryBlue, fontWeight: '700' },
  navArrowDisabled: { color: '#8A8E9F' },
  monthLabel: { fontSize: fs(16, 14, 18), fontWeight: '800', color: colors.textDark, fontFamily: numberFontFamily('800') },
  dowRow: { flexDirection: 'row', marginBottom: 6 },
  dowLabel: { flex: 1, textAlign: 'center', fontSize: fs(12, 10, 14), fontWeight: '700', color: '#4A5570' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  cellSel: { backgroundColor: colors.primaryBlue, borderRadius: 20 },
  dayNum: { fontSize: fs(14, 12, 16), color: colors.textDark, fontWeight: '500', fontFamily: numberFontFamily('500') },
  dayNumSel: { color: '#fff', fontWeight: '800', fontFamily: numberFontFamily('800') },
  dayNumDisabled: { color: '#8A8E9F' },
  cancelBtn: { marginTop: 12, backgroundColor: '#FAF3DE', borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  cancelTxt: { fontSize: fs(14, 12, 16), fontWeight: '700', color: colors.textDark },
});
