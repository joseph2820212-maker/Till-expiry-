import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppAlert, AlertConfig, AlertButton } from './AppAlert';
import { fs } from '../theme/responsive';

const CREAM = '#FAF3DE';
const NAVY = '#1A2540';
const ORANGE = '#E8842D';

export const AppAlertOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<AlertConfig | null>(null);

  useEffect(() => {
    AppAlert.register(setConfig);
    return () => AppAlert.unregister();
  }, []);

  if (!config) return null;

  const buttons: AlertButton[] = config.buttons?.length
    ? config.buttons
    : [{ text: t('common.ok') }];

  const dismiss = (onPress?: () => void) => {
    setConfig(null);
    if (onPress) setTimeout(onPress, 300);
  };

  const nonCancelBtns = buttons.filter(b => b.style !== 'cancel');
  const cancelBtn = buttons.find(b => b.style === 'cancel');

  const renderTitle = () => {
    if (config.isError) {
      return (
        <View style={s.header}>
          <Text style={s.errorTitle}>{t('common.error')}</Text>
        </View>
      );
    }
    if (config.title) {
      return (
        <View style={s.header}>
          <Text style={[s.title, config.isSuccess && s.successTitle]}>{config.title}</Text>
        </View>
      );
    }
    return null;
  };

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <Pressable style={s.backdrop} onPress={() => { if (cancelBtn) dismiss(cancelBtn.onPress); }}>
        <Pressable style={s.dialog} onPress={() => {}}>

          {renderTitle()}

          {config.message ? (
            <Text style={[s.message, !config.title && !config.isError && s.messageTopPad]}>
              {config.message}
            </Text>
          ) : null}

          <View style={s.btns}>
            {cancelBtn && (
              <TouchableOpacity style={[s.btn, s.btnCancel, buttons.length > 1 && s.btnFlex]} onPress={() => dismiss(cancelBtn.onPress)} activeOpacity={0.8}>
                <Text style={[s.btnText, s.btnCancelText]}>{cancelBtn.text}</Text>
              </TouchableOpacity>
            )}
            {nonCancelBtns.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  s.btn,
                  btn.style === 'destructive' ? s.btnDestructive : s.btnPrimary,
                  buttons.length > 1 && s.btnFlex,
                ]}
                onPress={() => dismiss(btn.onPress)}
                activeOpacity={0.85}
              >
                <Text style={[s.btnText, btn.style === 'destructive' ? s.btnDestructiveText : s.btnPrimaryText]}>
                  {btn.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 37, 64, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: CREAM,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5D9BE',
  },
  errorTitle: {
    fontSize: fs(18, 16, 20),
    fontWeight: '700',
    color: ORANGE,
  },
  title: {
    fontSize: fs(16, 14, 18),
    fontWeight: '700',
    color: NAVY,
  },
  successTitle: {
    color: NAVY,
  },
  message: {
    fontSize: fs(14, 13, 16),
    color: '#4A5570',
    lineHeight: 22,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  messageTopPad: { paddingTop: 22 },
  btns: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFlex: { flex: 1 },
  btnPrimary: { backgroundColor: NAVY },
  btnCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#D9CDB4',
  },
  btnDestructive: { backgroundColor: '#B14D38' },
  btnText: { fontSize: fs(15, 13, 17), fontWeight: '700', textAlign: 'center' },
  btnPrimaryText: { color: CREAM },
  btnCancelText: { color: NAVY, fontWeight: '600' },
  btnDestructiveText: { color: '#fff' },
});
