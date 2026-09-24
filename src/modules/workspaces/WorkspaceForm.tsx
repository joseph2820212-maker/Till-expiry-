/** Name, mode, currency and time zone of a workspace — shared by onboarding (E03) and workspace settings (E38). */
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { WorkspaceMode } from '../../domain/expiry/expiryTypes';
import { deviceTimeZone } from '../../domain/expiry/datePrecision';
import { ChoiceChips, Field, Hint } from '../../components/forms/FormBits';
import { DropdownField } from '../../components/DropdownField';
import { SYMBOL_MAP } from '../../utils/currency';
import { WORKSPACE_MODES, WORKSPACE_NAME_MAX } from './workspaceStore';

export const CURRENCY_CODES: string[] = [...new Set(Object.keys(SYMBOL_MAP).map(o => o.split(' ').pop() as string))];

/** Common zones for shops in the six languages' markets, plus the phone's own zone (always first). */
const COMMON_ZONES = [
  'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Istanbul', 'Europe/Brussels', 'Europe/Amsterdam', 'Europe/Zurich', 'Europe/Vienna',
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Bahrain', 'Africa/Cairo', 'Africa/Casablanca', 'Africa/Algiers', 'Africa/Tunis', 'Asia/Amman', 'Asia/Beirut', 'Asia/Baghdad',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Mexico_City', 'America/Bogota', 'America/Argentina/Buenos_Aires', 'America/Toronto', 'Australia/Sydney', 'UTC',
];
export function zoneOptions(): string[] { return [...new Set([deviceTimeZone(), ...COMMON_ZONES])]; }

export interface WorkspaceFormValue { name: string; mode: WorkspaceMode; currency: string; timeZone: string }

export const WorkspaceForm: React.FC<{ value: WorkspaceFormValue; onChange: (v: WorkspaceFormValue) => void; nameError?: string; showMode?: boolean }> = ({ value, onChange, nameError, showMode = true }) => {
  const { t } = useTranslation();
  const set = (patch: Partial<WorkspaceFormValue>) => onChange({ ...value, ...patch });
  return (
    <View style={{ gap: 12 }}>
      <Field label={t('workspace.name')} value={value.name} onChangeText={name => set({ name })} placeholder={t('workspace.namePh')} maxLength={WORKSPACE_NAME_MAX} error={nameError} testID="ws-name" />
      {showMode ? <ChoiceChips label={t('workspace.mode')} options={WORKSPACE_MODES.map(m => ({ value: m, label: t(`mode.${m}`) }))} value={value.mode} onChange={mode => set({ mode })} /> : null}
      <DropdownField label={t('workspace.currency')} value={value.currency} options={['', ...CURRENCY_CODES]} getLabel={c => (c ? c : t('workspace.currencyNone'))} onSelect={currency => set({ currency })} placeholder={t('workspace.currencyNone')} />
      <Hint text={t('workspace.currencyHint')} />
      <DropdownField label={t('workspace.timeZone')} value={value.timeZone} options={zoneOptions()} onSelect={timeZone => set({ timeZone })} />
      <Hint text={t('workspace.timeZoneHint')} />
    </View>
  );
};
