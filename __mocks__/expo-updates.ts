// Test mock for expo-updates. The real module pulls in expo-modules-core native
// code that isn't linked under jest; we only need reloadAsync to be callable.
export const reloadAsync = jest.fn(() => Promise.resolve());
export const checkForUpdateAsync = jest.fn(() => Promise.resolve({ isAvailable: false }));
export const fetchUpdateAsync = jest.fn(() => Promise.resolve({ isNew: false }));
