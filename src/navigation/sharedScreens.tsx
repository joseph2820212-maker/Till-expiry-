import React from 'react';
import type { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { TabStackParamList } from './AppNavigator';
import { CurrencyScreen } from '../modules/more/screens/CurrencyScreen';
import { LanguageScreen } from '../modules/more/screens/LanguageScreen';
import { HelpScreen } from '../modules/more/screens/HelpScreen';
import { LegalScreen } from '../modules/more/screens/LegalScreen';
import { AboutScreen } from '../modules/more/screens/AboutScreen';
import { OfflinePrivateScreen } from '../modules/more/screens/OfflinePrivateScreen';
import { BackupScreen } from '../modules/backup/screens/BackupScreen';
import { DatesSettingsScreen } from '../modules/settings/screens/DatesSettingsScreen';
import { AddDateScreen } from '../modules/dates/screens/AddDateScreen';
import { DateDetailScreen } from '../modules/dates/screens/DateDetailScreen';
import { DateCheckScreen } from '../modules/dates/screens/DateCheckScreen';
import { ReportsScreen } from '../modules/reports/screens/ReportsScreen';
import { ProductDetailScreen } from '../modules/products/screens/ProductDetailScreen';
import { ScanScreen } from '../modules/products/screens/ScanScreen';
import { ImportScreen } from '../modules/import/screens/ImportScreen';

/**
 * Every non-tab screen of the app, registered inside EACH tab's stack. Pushing a
 * screen therefore stays under the bottom tab bar (the bar is never hidden), and
 * each tab keeps its own history. `navigate('X')` resolves in the current tab.
 */
export type AppStack = ReturnType<typeof createNativeStackNavigator<TabStackParamList>>;

export function sharedScreens(Stack: AppStack): React.ReactElement {
  return (
    <>
      <Stack.Screen name="SettingsCurrency" component={CurrencyScreen} />
      <Stack.Screen name="SettingsLanguage" component={LanguageScreen} />
      <Stack.Screen name="SettingsHelp" component={HelpScreen} />
      <Stack.Screen name="SettingsLegal" component={LegalScreen} />
      <Stack.Screen name="SettingsBackup" component={BackupScreen} />
      <Stack.Screen name="SettingsAbout" component={AboutScreen} />
      <Stack.Screen name="SettingsOfflinePrivate" component={OfflinePrivateScreen} />
      <Stack.Screen name="SettingsDates" component={DatesSettingsScreen} />
      <Stack.Screen name="AddDate" component={AddDateScreen} />
      <Stack.Screen name="DateDetail" component={DateDetailScreen} />
      <Stack.Screen name="DateCheck" component={DateCheckScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="Scan" component={ScanScreen} />
      <Stack.Screen name="Import" component={ImportScreen} />
    </>
  );
}
