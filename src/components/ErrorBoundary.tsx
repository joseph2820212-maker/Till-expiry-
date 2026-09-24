import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import i18n from '../i18n';
import { logError } from '../utils/errorLog';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error', error, info.componentStack);
    void logError('ErrorBoundary', error, { fatal: true, extra: (info.componentStack || '').slice(0, 500) });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={s.container}>
          <Text style={s.title}>{i18n.t('errors.crashTitle')}</Text>
          <Text style={s.body}>{i18n.t('errors.crashBody')}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title:     { fontSize: 18, fontWeight: '700', color: colors.textDark, marginBottom: 8 },
  body:      { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
