import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { WorkspaceMode } from '../../domain/expiry/expiryTypes';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ChooseModeScreen } from './screens/ChooseModeScreen';
import { WorkspaceSetupScreen } from './screens/WorkspaceSetupScreen';

/** E01 Welcome → E02 ChooseMode → E03 WorkspaceSetup. E04 ReminderIntro follows inside the app (first Today visit). */
export type OnboardingParamList = {
  Welcome: undefined;
  ChooseMode: undefined;
  WorkspaceSetup: { mode: WorkspaceMode };
};

const S = createNativeStackNavigator<OnboardingParamList>();

export const OnboardingNavigator: React.FC = () => (
  <S.Navigator screenOptions={{ headerShown: false }}>
    <S.Screen name="Welcome" component={WelcomeScreen} />
    <S.Screen name="ChooseMode" component={ChooseModeScreen} />
    <S.Screen name="WorkspaceSetup" component={WorkspaceSetupScreen} />
  </S.Navigator>
);
