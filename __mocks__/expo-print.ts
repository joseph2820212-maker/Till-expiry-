// expo-print mock for Jest.
export const printToFileAsync = jest.fn(async (_options?: object) => ({
  uri: 'file:///mock/output.pdf',
}));

export const printAsync = jest.fn(async () => {});
