/**
 * Jest mock for expo-camera. The real module needs a native camera; screens
 * that scan barcodes render a plain View here and permission is granted.
 */
import React from 'react';
import { View } from 'react-native';

export type BarcodeScanningResult = { type: string; data: string };

export const CameraView = ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
  React.createElement(View, { testID: 'mock-camera-view', ...props }, children);

export type MockPermission = { status: string; granted: boolean; canAskAgain: boolean; expires: string };
const granted: MockPermission = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };
let current: MockPermission = granted;
/** Tests: set the permission state the hook reports (granted / undetermined / denied). */
export function __setPermission(p: Partial<MockPermission> | 'granted' | 'undetermined' | 'denied'): void {
  if (p === 'granted') current = granted;
  else if (p === 'undetermined') current = { status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' };
  else if (p === 'denied') current = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };
  else current = { ...granted, ...p };
}
export const requestPermissionMock = jest.fn(async () => { current = granted; return granted; });

export function useCameraPermissions(): [MockPermission, () => Promise<MockPermission>] {
  return [current, requestPermissionMock];
}

export const Camera = {
  requestCameraPermissionsAsync: async () => granted,
  getCameraPermissionsAsync: async () => granted,
};

export default { CameraView, useCameraPermissions, Camera };
