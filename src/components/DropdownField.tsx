import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fs } from '../theme/responsive';
import { useResponsive } from '../theme/useResponsive';
import { OtherInputModal } from './OtherInputModal';
import { safeSheetBottom } from '../utils/safeArea';

// Shared with FilterMenuChip so every "choose something" sheet is the same size
// and never grows tall enough to bury the field behind it — the list scrolls.
interface Props {
  label?: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  placeholder?: string;
  getLabel?: (v: string) => string;
  /** When true, appends "Other" as the last option. Selecting it opens a
   *  text-input modal and onSelect receives the typed string. */
  allowOther?: boolean;
  /** Custom title for the "Other" input modal (defaults to t('common.other')). */
  otherTitle?: string;
}

export const DropdownField: React.FC<Props> = ({
  label, value, options, onSelect, placeholder, getLabel, allowOther = false, otherTitle,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height, isTablet } = useResponsive();
  const [open, setOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const otherLabel = t('common.other');
  const displayValue = value ? (getLabel ? getLabel(value) : value) : '';
  const fullOptions = allowOther ? [...options, otherLabel] : options;
  // A value is "other" when allowOther is on and the value is not in the base options list.
  const isOtherValue = allowOther && !!value && !options.includes(value);
  const bottomInset = safeSheetBottom(insets.bottom);
  const sheetMaxHeight = isTablet
    ? Math.min(560, Math.round(height * 0.8))
    : Math.max(260, height - Math.max(insets.top, 12) - bottomInset - 24);
  const listMaxHeight = Math.round(sheetMaxHeight * 0.62);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={2} ellipsizeMode="tail">{displayValue || placeholder || t('common.select')}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} style={styles.chevron} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={[styles.overlay, isTablet && styles.overlayCenter]} onPress={() => setOpen(false)} activeOpacity={1}>
          {/* Swallow taps on the sheet so they don't reach the overlay's close
              handler. Must be a TouchableOpacity (the pattern used by AppAlert /
              OtherInputModal) — a plain View with onStartShouldSetResponder grabs
              the touch and, under forced RTL (Arabic), the option rows below stop
              receiving taps (you could see the name but not select it). */}
          <TouchableOpacity
            style={[styles.sheet, isTablet && styles.sheetTablet, { maxHeight: sheetMaxHeight, paddingBottom: isTablet ? 20 : bottomInset + 14 }]}
            activeOpacity={1}
            onPress={() => { /* swallow */ }}
          >
            {!isTablet ? <View style={styles.handle} /> : null}
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
            <ScrollView style={{ maxHeight: listMaxHeight }} keyboardShouldPersistTaps="handled">
              {fullOptions.map(item => {
                const isOtherOption = allowOther && item === otherLabel;
                const isActive = isOtherOption ? isOtherValue : item === value;
                return (
                  <TouchableOpacity
                    key={item}
                    style={styles.option}
                    activeOpacity={0.85}
                    onPress={() => {
                      setOpen(false);
                      if (isOtherOption) {
                        setOtherOpen(true);
                      } else {
                        onSelect(item);
                      }
                    }}
                  >
                    <Text style={[styles.optionText, isActive && styles.optionTextActive]} numberOfLines={2}>
                      {isOtherOption ? otherLabel : (getLabel ? getLabel(item) : item)}
                    </Text>
                    {isActive ? <Ionicons name="checkmark" size={18} color={colors.primaryBlue} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.cancelRow} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {allowOther ? (
        <OtherInputModal
          visible={otherOpen}
          title={otherTitle}
          initialValue={isOtherValue ? value : ''}
          onConfirm={(typed) => { setOtherOpen(false); onSelect(typed); }}
          onCancel={() => setOtherOpen(false)}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  label: { fontSize: fs(12, 10, 14), fontWeight: '700', color: '#4A5570', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  trigger: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardWhite, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, height: 50 },
  value: { flex: 1, fontSize: fs(15, 13, 17), color: colors.textDark },
  placeholder: { color: '#4A5570' },
  chevron: { fontSize: fs(11, 9, 13), color: colors.textMuted, marginStart: 8 },
  // ── Bottom-sheet picker — matches FilterMenuChip so every dropdown is identical ──
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  overlayCenter: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  sheet: { backgroundColor: '#FAF3DE', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 26 },
  sheetTablet: { width: '100%', maxWidth: 460, borderRadius: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D9CDB4', alignSelf: 'center', marginBottom: 10 },
  sheetTitle: { fontSize: fs(11, 9, 13), fontWeight: '800', color: '#4A5570', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4, marginHorizontal: 4 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(217,205,180,0.45)' },
  optionText: { flex: 1, fontSize: fs(15, 13, 17), fontWeight: '500', color: '#1A2540' },
  optionTextActive: { color: colors.primaryBlue, fontWeight: '700' },
  cancelRow: { paddingVertical: 13, alignItems: 'center', marginTop: 2 },
  cancelText: { fontSize: fs(15, 14, 16), fontWeight: '700', color: '#8A8E9F' },
});
