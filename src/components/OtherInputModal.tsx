// OtherInputModal — reusable text-input modal for the "Other" dropdown rule.
//
// When a picker shows "Other" as its last option and the user selects it,
// open this modal so they can type a custom value. The typed value is
// returned via onConfirm. Callers store it on the record like any other
// category/list value.

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTextInput } from './AppTextInput';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import { fs } from '../theme/responsive';
import { safeSheetBottom } from '../utils/safeArea';

interface Props {
  visible: boolean;
  title?: string;
  placeholder?: string;
  initialValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const OtherInputModal: React.FC<Props> = ({
  visible, title, placeholder, initialValue = '', onConfirm, onCancel,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  const kb = useKeyboardHeight(); // lift the bottom sheet above the keyboard (Android-reliable)
  const [value, setValue] = useState(initialValue);
  const bottomInset = safeSheetBottom(insets.bottom);
  const sheetMaxHeight = isTablet
    ? Math.min(560, Math.round(height * 0.8))
    : Math.max(260, height - Math.max(insets.top, 12) - bottomInset - 24);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const trimmed = value.trim();
  const canConfirm = trimmed.length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
      <TouchableOpacity style={[s.overlay, isTablet && s.overlayCenter, kb > 0 && { paddingBottom: kb }]} activeOpacity={1} onPress={onCancel}>
          <TouchableOpacity style={[s.sheet, isTablet && s.sheetTablet, { maxHeight: sheetMaxHeight, paddingBottom: isTablet ? 20 : bottomInset + 14 }]} activeOpacity={1} onPress={() => { /* swallow */ }}>
            {!isTablet ? <View style={s.handle} /> : null}
            <Text style={s.title}>{title || t('common.other')}</Text>
            <Text style={s.label}>{t('common.otherInputLabel')}</Text>
            <AppTextInput
              style={s.input}
              value={value}
              onChangeText={setValue}
              placeholder={placeholder || t('common.otherPlaceholder')}
              placeholderTextColor="#8A8E9F"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleConfirm} blurOnSubmit={true} />
            <View style={s.btnRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.85}>
                <Text style={s.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, !canConfirm && s.confirmBtnDisabled]}
                onPress={handleConfirm}
                disabled={!canConfirm}
                activeOpacity={0.85}
              >
                <Text style={s.confirmText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  overlayCenter:    { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  sheet:            { backgroundColor: '#FAF3DE', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 },
  sheetTablet:      { width: '100%', maxWidth: 460, borderRadius: 24 },
  handle:           { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D9CDB4', alignSelf: 'center', marginBottom: 14 },
  title:            { fontSize: fs(16, 14, 18), fontWeight: '800', color: '#1A2540', textAlign: 'center', marginBottom: 16 },
  label:            { fontSize: fs(10, 9, 12), fontWeight: '800', color: '#4A5570', letterSpacing: 0.8, marginBottom: 8 },
  input:            { backgroundColor: '#F4ECD6', borderWidth: 1.5, borderColor: '#D9CDB4', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: fs(15, 13, 17), color: '#1A2540', marginBottom: 16 },
  btnRow:           { flexDirection: 'row', gap: 10 },
  cancelBtn:        { flex: 1, paddingVertical: 13, backgroundColor: '#FAF3DE', borderRadius: 14, alignItems: 'center' },
  cancelText:       { fontSize: fs(14, 12, 16), fontWeight: '700', color: '#4A5570' },
  confirmBtn:       { flex: 2, paddingVertical: 13, backgroundColor: colors.primaryBlue, borderRadius: 14, alignItems: 'center' },
  confirmBtnDisabled:{ opacity: 0.4 },
  confirmText:      { fontSize: fs(14, 12, 16), fontWeight: '800', color: '#fff' },
});
