import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fs } from '../theme/responsive';
import { TodayScreen } from '../modules/today/screens/TodayScreen';
import { ItemsScreen } from '../modules/items/screens/ItemsScreen';
import { AddChoiceScreen } from '../modules/add/screens/AddChoiceScreen';
import { ReportsHomeScreen } from '../modules/reports/screens/ReportsHomeScreen';
import { MoreScreen } from '../modules/more/screens/MoreScreen';
import { WorkspaceSwitcherSheet } from '../modules/workspaces/WorkspaceSwitcherSheet';
import { useNavigation, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import type { TabRoot } from './tabs';

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { TabStackParamList } from './AppNavigator';
import { sharedScreens } from './sharedScreens';

/** Each tab hosts its own stack: the tab's root screen plus every shared screen. */
export type TabParamList = {
  TodayTab: NavigatorScreenParams<TabStackParamList> | undefined;
  ItemsTab: NavigatorScreenParams<TabStackParamList> | undefined;
  AddTab: NavigatorScreenParams<TabStackParamList> | undefined;
  ReportsTab: NavigatorScreenParams<TabStackParamList> | undefined;
  MoreTab: NavigatorScreenParams<TabStackParamList> | undefined;
};

function makeTabStack(rootName: TabRoot, Root: React.ComponentType<any>): React.FC {
  const S = createNativeStackNavigator<TabStackParamList>();
  const TabStack: React.FC = () => (
    <S.Navigator screenOptions={{ headerShown: false }}>
      <S.Screen name={rootName} component={Root} />
      {sharedScreens(S, rootName)}
    </S.Navigator>
  );
  TabStack.displayName = `${rootName}Stack`;
  return TabStack;
}
const TodayStack = makeTabStack('Today', TodayScreen);
const ItemsStack = makeTabStack('Items', ItemsScreen);
const AddStack = makeTabStack('AddChoice', AddChoiceScreen);
const ReportsStack = makeTabStack('ReportsHome', ReportsHomeScreen);
const MoreStack = makeTabStack('More', MoreScreen);

const Tab = createBottomTabNavigator<TabParamList>();

const ICON_MAP: Record<string, { active: string; inactive: string }> = {
  TodayTab:   { active: 'today',        inactive: 'today-outline' },
  ItemsTab:   { active: 'file-tray-full', inactive: 'file-tray-full-outline' },
  AddTab:     { active: 'add-circle',   inactive: 'add-circle-outline' },
  ReportsTab: { active: 'bar-chart',    inactive: 'bar-chart-outline' },
  MoreTab:    { active: 'menu',         inactive: 'menu-outline' },
};

/** The only screens allowed to hide the tab bar (§5): the camera scanner and the native PDF preview. */
export const FULL_SCREEN = new Set(['BarcodeScanner', 'ReportPreview', 'InternalLabelPreview']);

const ACTIVE_COLOR = '#FFFFFF';
const INACTIVE_COLOR = '#C7CFDE';
const ACCENT_MARK = '#E8842D';

export const TabNavigator: React.FC = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 7);

  const nav = useNavigation<any>();
  return (
    <>
    <Tab.Navigator
      screenOptions={({ route }: { route: any }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }: { focused: boolean }) => {
          const iconName = focused ? ICON_MAP[route.name]?.active : ICON_MAP[route.name]?.inactive;
          return (
            <View style={styles.iconWrap}>
              <Ionicons name={iconName as any} size={20} color={focused ? ACTIVE_COLOR : INACTIVE_COLOR} />
              {focused && <View style={styles.activeMark} />}
            </View>
          );
        },
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: FULL_SCREEN.has(getFocusedRouteNameFromRoute(route) ?? '')
          ? { display: 'none' as const }
          : [styles.tabBar, { paddingBottom: bottomPad, height: 62 + bottomPad }],
        tabBarLabelStyle: styles.tabLabel,
      })}
    >
      <Tab.Screen name="TodayTab" component={TodayStack} options={{ tabBarLabel: t('nav.today') }} />
      <Tab.Screen name="ItemsTab" component={ItemsStack} options={{ tabBarLabel: t('nav.items') }} />
      <Tab.Screen name="AddTab" component={AddStack} options={{ tabBarLabel: t('nav.add') }} />
      <Tab.Screen name="ReportsTab" component={ReportsStack} options={{ tabBarLabel: t('nav.reports') }} />
      <Tab.Screen name="MoreTab" component={MoreStack} options={{ tabBarLabel: t('nav.more') }} />
    </Tab.Navigator>
    <WorkspaceSwitcherSheet onManage={() => nav.navigate('Tabs', { screen: 'MoreTab', params: { screen: 'Workspaces', initial: false } })} />
    </>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.primaryBlue,
    borderTopWidth: 0,
    paddingTop: 8,
    elevation: 0,
  },
  tabLabel: { fontSize: fs(10, 9, 11), fontWeight: '600' },
  iconWrap: { alignItems: 'center' },
  activeMark: {
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: ACCENT_MARK,
    marginTop: 4,
  },
});
