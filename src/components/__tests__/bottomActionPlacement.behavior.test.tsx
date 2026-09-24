import React from 'react';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

let mockBottomInset = 34;

jest.mock('react-native', () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text', View: 'View', ScrollView: 'ScrollView',
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: mockBottomInset, left: 0 }),
}));
jest.mock('../../hooks/useKeyboardMode', () => ({ useKeyboardMode: () => false }));
jest.mock('../../utils/safeArea', () => ({ safeBottom: (value: number) => value }));
jest.mock('../../theme/responsive', () => ({ fs: (value: number) => value, rs: (value: number) => value }));
jest.mock('../AppButton', () => ({ AppButton: 'AppButton' }));

import {
  AppBottomActions,
  AppBottomContentGap,
  AppBottomTabBarVisibilityProvider,
} from '../AppShared';

const renderedStyle = (node: any) =>
  Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style.filter(Boolean)) : node.props.style;

const render = (element: React.ReactElement) => {
  let renderer: any;
  act(() => { renderer = TestRenderer.create(element); });
  return renderer;
};

describe('shared bottom-action placement', () => {
  beforeEach(() => { mockBottomInset = 34; });

  it('uses an 8dp gap when the phone tab bar already owns the safe inset', () => {
    const renderer = render(
      <AppBottomTabBarVisibilityProvider visible>
        <AppBottomActions>Save</AppBottomActions>
      </AppBottomTabBarVisibilityProvider>,
    );
    expect(renderedStyle(renderer.root.findAllByType('View')[0]).paddingBottom).toBe(8);
  });

  it('keeps the device inset plus 12dp outside a visible bottom tab bar', () => {
    const renderer = render(<AppBottomActions>Save</AppBottomActions>);
    expect(renderedStyle(renderer.root.findAllByType('View')[0]).paddingBottom).toBe(46);
  });

  it('uses device-edge placement on tablet where navigation is a sidebar', () => {
    const renderer = render(
      <AppBottomTabBarVisibilityProvider visible={false}>
        <AppBottomActions>Save</AppBottomActions>
      </AppBottomTabBarVisibilityProvider>,
    );
    expect(renderedStyle(renderer.root.findAllByType('View')[0]).paddingBottom).toBe(46);
  });

  it('allows a full-screen modal to override a visible parent tab bar', () => {
    const renderer = render(
      <AppBottomTabBarVisibilityProvider visible>
        <AppBottomActions placement="device-edge">Done</AppBottomActions>
      </AppBottomTabBarVisibilityProvider>,
    );
    expect(renderedStyle(renderer.root.findAllByType('View')[0]).paddingBottom).toBe(46);
  });

  it('removes only the duplicated safe inset from the tab-screen content gap', () => {
    const tabRenderer = render(
      <AppBottomTabBarVisibilityProvider visible><AppBottomContentGap /></AppBottomTabBarVisibilityProvider>,
    );
    const edgeRenderer = render(<AppBottomContentGap />);
    expect(renderedStyle(tabRenderer.root.findByType('View')).height).toBe(100);
    expect(renderedStyle(edgeRenderer.root.findByType('View')).height).toBe(134);
  });

});
