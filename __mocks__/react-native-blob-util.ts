// Jest mock for react-native-blob-util (native dependency of react-native-pdf).
export default {
  fs: { dirs: {} },
  config: () => ({ fetch: () => Promise.resolve({}) }),
};
