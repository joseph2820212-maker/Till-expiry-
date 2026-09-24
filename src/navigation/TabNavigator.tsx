import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fs } from '../theme/responsive';
import { HomeScreen } from '../modules/home/screens/HomeScreen';
import { ProductsScreen } from '../modules/products/screens/ProductsScreen';
import { DatesScreen } from '../modules/dates/screens/DatesScreen';
import { MoreScreen } from '../modules/more/screens/MoreScreen';
import type { TabRoot } from './tabs';

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { TabStackParamList } from './AppNavigator';
import { sharedScreens } from './sharedScreens';

/** Each tab hosts its own stack: the tab's root screen plus every shared screen. */
export type TabParamList = {
  HomeTab: NavigatorScreenParams<TabStackParamList> | undefined;
  DatesTab: NavigatorScreenParams<TabStackParamList> | undefined;
  ProductsTab: NavigatorScreenParams<TabStackParamList> | undefined;
  MoreTab: NavigatorScreenParams<TabStackParamList> | undefined;
};

function makeTabStack(rootName: TabRoot, Root: React.ComponentType<any>): React.FC {
  const S = createNativeStackNavigator<TabStackParamList>();
  const TabStack: React.FC = () => (
    <S.Navigator screenOptions={{ headerShown: false }}>
      <S.Screen name={rootName} component={Root} />
      {sharedScreens(S)}
    </S.Navigator>
  );
  TabStack.displayName = `${rootName}Stack`;
  return TabStack;
}
const HomeStack = makeTabStack('Home', HomeScreen);
const DatesStack = makeTabStack('Dates', DatesScreen);
const ProductsStack = makeTabStack('Products', ProductsScreen);
const MoreStack = makeTabStack('More', MoreScreen);

const Tab = createBottomTabNavigator<TabParamList>();

const ICON_MAP: Record<string, { active: string; inactive: string }> = {
  HomeTab:        { active: 'today',             inactive: 'today-outline' },
  DatesTab:       { active: 'calendar',          inactive: 'calendar-outline' },
  ProductsTab:    { active: 'pricetags',         inactive: 'pricetags-outline' },
  MoreTab:        { active: 'menu',              inactive: 'menu-outline' },
};

const ACTIVE_COLOR = '#FFFFFF';
const INACTIVE_COLOR = '#C7CFDE';
const ACCENT_MARK = '#E8842D';

export const TabNavigator: React.FC = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 7);

  return (
    <Tab.Navigator
      screenOptions={({ route }: { route: { name: string } }) => ({
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
        tabBarStyle: [styles.tabBar, { paddingBottom: bottomPad, height: 62 + bottomPad }],
        tabBarLabelStyle: styles.tabLabel,
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} options={{ tabBarLabel: t('nav.home') }} />
      <Tab.Screen name="DatesTab" component={DatesStack} options={{ tabBarLabel: t('nav.dates') }} />
      <Tab.Screen name="ProductsTab" component={ProductsStack} options={{ tabBarLabel: t('nav.products') }} />
      <Tab.Screen name="MoreTab" component={MoreStack} options={{ tabBarLabel: t('nav.more') }} />
    </Tab.Navigator>
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
