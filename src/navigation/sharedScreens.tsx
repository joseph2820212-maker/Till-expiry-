import React from 'react';
import type { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { TabStackParamList } from './AppNavigator';
import { ExpiryQueueScreen } from '../modules/today/screens/ExpiryQueueScreen';
import { CheckRoundScreen } from '../modules/today/screens/CheckRoundScreen';
import { GlobalSearchScreen } from '../modules/search/GlobalSearchScreen';
import { ItemsScreen } from '../modules/items/screens/ItemsScreen';
import { ProductDetailScreen } from '../modules/products/screens/ProductDetailScreen';
import { ProductEditScreen } from '../modules/products/screens/ProductEditScreen';
import { BatchDetailScreen } from '../modules/batches/screens/BatchDetailScreen';
import { BatchHistoryScreen } from '../modules/batches/screens/BatchHistoryScreen';
import { DeadlineCorrectionScreen } from '../modules/batches/screens/DeadlineCorrectionScreen';
import { MoveLocationScreen } from '../modules/batches/screens/MoveLocationScreen';
import { BarcodeScannerScreen } from '../modules/add/screens/BarcodeScannerScreen';
import { AddBoughtInScreen, AddOtherDatedScreen } from '../modules/add/screens/AddBoughtInScreen';
import { AddOpenedScreen } from '../modules/add/screens/AddOpenedScreen';
import { AddPreparedScreen } from '../modules/add/screens/AddPreparedScreen';
import { RulesListScreen } from '../modules/rules/screens/RulesListScreen';
import { RuleEditScreen } from '../modules/rules/screens/RuleEditScreen';
import { LocationsListScreen } from '../modules/locations/screens/LocationsListScreen';
import { LocationDetailScreen } from '../modules/locations/screens/LocationDetailScreen';
import { ExpiryReportScreen } from '../modules/reports/screens/ExpiryReportScreen';
import { WasteReportScreen } from '../modules/reports/screens/WasteReportScreen';
import { ReportPreviewScreen } from '../modules/reports/screens/ReportPreviewScreen';
import { InternalLabelPreviewScreen } from '../modules/labels/screens/InternalLabelPreviewScreen';
import { CsvImportScreen } from '../modules/import/screens/CsvImportScreen';
import { CsvImportPreviewScreen } from '../modules/import/screens/CsvImportPreviewScreen';
import { DataExportScreen } from '../modules/export/screens/DataExportScreen';
import { BackupRestoreScreen } from '../modules/backup/screens/BackupRestoreScreen';
import { RestorePreviewScreen } from '../modules/backup/screens/RestorePreviewScreen';
import { WorkspacesScreen } from '../modules/workspaces/screens/WorkspacesScreen';
import { WorkspaceSettingsScreen } from '../modules/workspaces/screens/WorkspaceSettingsScreen';
import { ReminderSettingsScreen } from '../modules/reminders/screens/ReminderSettingsScreen';
import { GeneralSettingsScreen } from '../modules/settings/screens/GeneralSettingsScreen';
import { LanguageScreen } from '../modules/more/screens/LanguageScreen';
import { HelpScreen } from '../modules/more/screens/HelpScreen';
import { LegalScreen } from '../modules/more/screens/LegalScreen';
import { AboutScreen } from '../modules/more/screens/AboutScreen';
import { OfflinePrivateScreen } from '../modules/more/screens/OfflinePrivateScreen';

/**
 * Every non-root screen of the app, registered inside EACH tab's stack, so a pushed screen stays under the bottom tab
 * bar and each tab keeps its own history. Only the scanner hides the bar (full-screen camera, §5).
 */
export type AppStack = ReturnType<typeof createNativeStackNavigator<TabStackParamList>>;

export const SHARED_SCREENS = {
  ExpiryQueue: ExpiryQueueScreen,
  CheckRound: CheckRoundScreen,
  GlobalSearch: GlobalSearchScreen,
  Items: ItemsScreen,
  ProductDetail: ProductDetailScreen,
  ProductEdit: ProductEditScreen,
  BatchDetail: BatchDetailScreen,
  BatchHistory: BatchHistoryScreen,
  DeadlineCorrection: DeadlineCorrectionScreen,
  MoveLocation: MoveLocationScreen,
  BarcodeScanner: BarcodeScannerScreen,
  AddBoughtIn: AddBoughtInScreen,
  AddOpened: AddOpenedScreen,
  AddPrepared: AddPreparedScreen,
  AddOtherDated: AddOtherDatedScreen,
  RulesList: RulesListScreen,
  RuleEdit: RuleEditScreen,
  LocationsList: LocationsListScreen,
  LocationDetail: LocationDetailScreen,
  ExpiryReport: ExpiryReportScreen,
  WasteReport: WasteReportScreen,
  ReportPreview: ReportPreviewScreen,
  InternalLabelPreview: InternalLabelPreviewScreen,
  CsvImport: CsvImportScreen,
  CsvImportPreview: CsvImportPreviewScreen,
  DataExport: DataExportScreen,
  BackupRestore: BackupRestoreScreen,
  RestorePreview: RestorePreviewScreen,
  Workspaces: WorkspacesScreen,
  WorkspaceSettings: WorkspaceSettingsScreen,
  ReminderSettings: ReminderSettingsScreen,
  GeneralSettings: GeneralSettingsScreen,
  SettingsLanguage: LanguageScreen,
  SettingsHelp: HelpScreen,
  SettingsLegal: LegalScreen,
  SettingsAbout: AboutScreen,
  SettingsOfflinePrivate: OfflinePrivateScreen,
} satisfies Partial<Record<keyof TabStackParamList, React.ComponentType<any>>>;

export function sharedScreens(Stack: AppStack, root: keyof TabStackParamList): React.ReactElement {
  return (
    <>
      {(Object.keys(SHARED_SCREENS) as (keyof typeof SHARED_SCREENS)[]).filter(n => n !== root).map(name => (
        <Stack.Screen key={name} name={name} component={SHARED_SCREENS[name]} />
      ))}
    </>
  );
}
