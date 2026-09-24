/**
 * PickerSheet — the ONE bottom-sheet used by every "choose something" menu.
 *
 * Same chrome everywhere: dimmed overlay, cream sheet with a drag handle, a
 * small-caps title, a scrollable option list capped at ~45% of the screen (so a
 * long list scrolls instead of growing to bury the field), and a Cancel row.
 * DropdownField / FilterMenuChip / TaxRatePicker already render this exact look;
 * bespoke pickers use this component so they match too.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fs } from '../theme/responsive';
import { useResponsive } from '../theme/useResponsive';
import { safeSheetBottom } from '../utils/safeArea';

interface PickerSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  hideCancel?: boolean;
}

export const PickerSheet: React.FC<PickerSheetProps> = ({ visible, onClose, title, children, hideCancel }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height, isTablet } = useResponsive();
  const bottomInset = safeSheetBottom(insets.bottom);
  // Phone: a bottom sheet. Tablet: a centred, width-capped card (form-sheet style)
  // so the picker doesn't span a huge screen — what big tablet apps do.
  const sheetMaxHeight = isTablet
    ? Math.min(560, Math.round(height * 0.8))
    : Math.max(260, height - Math.max(insets.top, 12) - bottomInset - 24);
  const listMaxHeight = Math.round(sheetMaxHeight * 0.62);
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={[ps.overlay, isTablet && ps.overlayCenter]} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity
          style={[ps.sheet, isTablet && ps.sheetTablet, { maxHeight: sheetMaxHeight, paddingBottom: isTablet ? 20 : bottomInset + 14 }]}
          activeOpacity={1}
          onPress={() => {}}
        >
          {!isTablet ? <View style={ps.handle} /> : null}
          {title ? <Text style={ps.title}>{title}</Text> : null}
          <ScrollView style={{ maxHeight: listMaxHeight }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {!hideCancel ? (
            <TouchableOpacity style={ps.cancelRow} onPress={onClose}>
              <Text style={ps.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

/** A single selectable option row, styled to match every other dropdown. */
export const PickerRow: React.FC<{ label: string; active?: boolean; onPress: () => void }> = ({ label, active, onPress }) => (
  <TouchableOpacity style={ps.row} onPress={onPress} activeOpacity={0.85}>
    <Text style={[ps.rowText, active && ps.rowTextActive]} numberOfLines={2}>{label}</Text>
    {active ? <Ionicons name="checkmark" size={18} color={colors.primaryBlue} /> : null}
  </TouchableOpacity>
);

const ps = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  overlayCenter: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  sheet: { backgroundColor: '#FAF3DE', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 26 },
  sheetTablet: { width: '100%', maxWidth: 460, borderRadius: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D9CDB4', alignSelf: 'center', marginBottom: 10 },
  title: { fontSize: fs(11, 9, 13), fontWeight: '800', color: '#4A5570', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4, marginHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(217,205,180,0.45)' },
  rowText: { flex: 1, fontSize: fs(15, 13, 17), fontWeight: '500', color: '#1A2540' },
  rowTextActive: { color: colors.primaryBlue, fontWeight: '700' },
  cancelRow: { paddingVertical: 13, alignItems: 'center', marginTop: 2 },
  cancelText: { fontSize: fs(15, 14, 16), fontWeight: '700', color: '#8A8E9F' },
});
