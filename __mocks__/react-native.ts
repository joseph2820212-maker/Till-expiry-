// Minimal react-native stub for Jest (non-UI tests only).
export const I18nManager = { isRTL: false, forceRTL: jest.fn(), allowRTL: jest.fn() };
export const Platform = { OS: 'ios', select: (obj: any) => obj.ios ?? obj.default };
export const NativeModules = {};
export const Alert = { alert: jest.fn() };
export const Linking = { openSettings: jest.fn() };
