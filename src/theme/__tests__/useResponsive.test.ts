import { classifyDevice, TABLET_MIN_SHORT_SIDE } from '../useResponsive';

// The tablet split-views / sidebar all branch on classifyDevice. Lock its rules:
// tablet = shortest side ≥ 600 (orientation-independent), so rotating a phone never
// turns it into a tablet, and an iPad is a tablet in both orientations.
describe('classifyDevice — tablet vs phone detection', () => {
  it('phones are never tablets (either orientation)', () => {
    expect(classifyDevice(390, 844).isTablet).toBe(false);   // iPhone portrait
    expect(classifyDevice(844, 390).isTablet).toBe(false);   // iPhone landscape
    expect(classifyDevice(430, 932).isTablet).toBe(false);   // large phone
  });

  it('iPads are tablets in both orientations', () => {
    expect(classifyDevice(820, 1180).isTablet).toBe(true);   // iPad portrait
    expect(classifyDevice(1180, 820).isTablet).toBe(true);   // iPad landscape
    expect(classifyDevice(768, 1024).isTablet).toBe(true);   // iPad mini
  });

  it('reports landscape when width > height', () => {
    expect(classifyDevice(1180, 820).isLandscape).toBe(true);
    expect(classifyDevice(820, 1180).isLandscape).toBe(false);
  });

  it('uses the documented 600dp shortest-side threshold', () => {
    expect(TABLET_MIN_SHORT_SIDE).toBe(600);
    expect(classifyDevice(600, 900).isTablet).toBe(true);
    expect(classifyDevice(599, 900).isTablet).toBe(false);
  });
});
