import pkg from '../../../package.json';

describe('Navigation dependency compatibility (Correction 1)', () => {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  it('@react-navigation/bottom-tabs is on v6', () => {
    const version = deps['@react-navigation/bottom-tabs'];
    expect(version).toMatch(/^[\^~]?6\./);
  });

  it('@react-navigation/native is on v6', () => {
    const version = deps['@react-navigation/native'];
    expect(version).toMatch(/^[\^~]?6\./);
  });

  it('@react-navigation/native-stack is on v6', () => {
    const version = deps['@react-navigation/native-stack'];
    expect(version).toMatch(/^[\^~]?6\./);
  });

  it('all three are on the same major version', () => {
    const majorOf = (v: string) => parseInt(v.replace(/^[\^~]/, '').split('.')[0], 10);
    const bottomTabs = majorOf(deps['@react-navigation/bottom-tabs']);
    const native = majorOf(deps['@react-navigation/native']);
    const nativeStack = majorOf(deps['@react-navigation/native-stack']);
    expect(bottomTabs).toBe(native);
    expect(native).toBe(nativeStack);
  });
});
