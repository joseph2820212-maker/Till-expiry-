import type { NavigatorScreenParams } from '@react-navigation/native';
import type { TabStackParamList } from './AppNavigator';
import type { TabParamList } from './TabNavigator';

export type TabRoot = 'Today' | 'Items' | 'AddChoice' | 'ReportsHome' | 'More';
export const TAB_OF: Record<TabRoot, keyof TabParamList> = { Today: 'TodayTab', Items: 'ItemsTab', AddChoice: 'AddTab', ReportsHome: 'ReportsTab', More: 'MoreTab' };

/** Params for `navigate('Tabs', …)` that land on a tab's ROOT screen (with optional params). */
export function tabTarget<R extends TabRoot>(root: R, params?: TabStackParamList[R]): NavigatorScreenParams<TabParamList> {
  const inner = { screen: root, params } as NavigatorScreenParams<TabStackParamList>;
  return { screen: TAB_OF[root], params: inner } as unknown as NavigatorScreenParams<TabParamList>;
}

/** Params for `navigate('Tabs', …)` that open any screen inside a given tab's stack. */
export function inTab<S extends keyof TabStackParamList>(root: TabRoot, screen: S, params?: TabStackParamList[S]): NavigatorScreenParams<TabParamList> {
  return { screen: TAB_OF[root], params: { screen, params, initial: false } } as unknown as NavigatorScreenParams<TabParamList>;
}
