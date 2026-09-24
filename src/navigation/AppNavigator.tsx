import React from 'react';
import { NavigationContainer, NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TabNavigator, TabParamList } from './TabNavigator';
import type { LegalDocId } from '../modules/more/content/legalContent';
import type { StatusGroup } from '../domain/expiry/statusEngine';
import { useActiveWorkspace } from '../modules/workspaces/workspaceStore';
import { OnboardingNavigator } from '../modules/onboarding/OnboardingNavigator';

/** Filters a list of batches can be opened with (Today tiles, location chips, reports). */
export interface BatchQuery {
  group?: StatusGroup | 'attention';
  locationId?: string;
  kind?: 'bought_in' | 'opened' | 'prepared' | 'other';
}

/**
 * Every screen inside a tab's stack (master handoff §15 screen register E05–E44). The full register with states is
 * in docs/MASTER_BUILD_REPORT.md (G3).
 */
export type TabStackParamList = {
  // Tab roots
  Today: undefined;                                  // E05
  Items: { query?: BatchQuery; mode?: 'batches' | 'products' } | undefined; // E09 (+ batches view)
  AddChoice: undefined;                              // E14
  ReportsHome: undefined;                            // E27
  More: undefined;                                   // E37
  // Today
  ExpiryQueue: { query?: BatchQuery } | undefined;   // E06
  CheckRound: { query?: BatchQuery } | undefined;    // E07
  GlobalSearch: undefined;                           // E08
  // Items
  ProductDetail: { id: string };                     // E10
  ProductEdit: { id?: string; barcode?: string; symbology?: string } | undefined; // E11
  BatchDetail: { id: string };                       // E12
  BatchHistory: { id: string };                      // E13
  // Add
  BarcodeScanner: { purpose: 'add' | 'find' | 'attach' | 'open' }; // E15
  AddBoughtIn: { productId?: string; barcode?: string; symbology?: string; gs1?: string } | undefined; // E16
  AddOpened: { parentBatchId?: string; productId?: string } | undefined; // E17
  AddPrepared: { productId?: string } | undefined;   // E18
  AddOtherDated: { productId?: string; barcode?: string; symbology?: string } | undefined; // E19
  // Rules and locations
  RulesList: undefined;                              // E20
  RuleEdit: { id?: string; appliesTo?: 'after_opening' | 'after_preparation' | 'manual_review' } | undefined; // E21
  LocationsList: undefined;                          // E22
  LocationDetail: { id?: string } | undefined;       // E23
  // Actions (E24 BatchActionSheet is a sheet inside BatchDetail)
  DeadlineCorrection: { id: string };                // E25
  MoveLocation: { id: string };                      // E26
  // Reports
  ExpiryReport: undefined;                           // E28
  WasteReport: undefined;                            // E29
  ReportPreview: { report: 'expiry' | 'waste' };     // E30
  // Labels
  InternalLabelPreview: { batchIds: string[] };      // E31
  // Data
  CsvImport: { kind: 'products' | 'batches' };       // E32
  CsvImportPreview: { kind: 'products' | 'batches' }; // E33
  DataExport: undefined;                             // E34
  BackupRestore: undefined;                          // E35
  RestorePreview: undefined;                         // E36
  // More / settings
  WorkspaceSettings: { id?: string; create?: boolean } | undefined; // E38 (+ business list)
  Workspaces: undefined;                             // E38 list of businesses
  ReminderSettings: undefined;                       // E39
  GeneralSettings: undefined;                        // E40
  SettingsLanguage: undefined;                       // E41
  SettingsHelp: { tab?: 'guide' | 'faq'; chapter?: string } | undefined; // E42
  SettingsLegal: { doc: LegalDocId };                // E43
  SettingsAbout: undefined;                          // E44
  SettingsOfflinePrivate: undefined;
};

export type RootStackParamList = TabStackParamList & { Tabs: NavigatorScreenParams<TabParamList> | undefined };

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root: onboarding until a workspace exists, then a single "Tabs" route. All feature screens live in the per-tab
 * stacks (TabNavigator / sharedScreens) so the bottom navigation stays visible (§5).
 */
export const AppNavigator: React.FC = () => {
  const ws = useActiveWorkspace();
  return (
    <NavigationContainer>
      {ws ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs" component={TabNavigator} />
        </Stack.Navigator>
      ) : (
        <OnboardingNavigator />
      )}
    </NavigationContainer>
  );
};

