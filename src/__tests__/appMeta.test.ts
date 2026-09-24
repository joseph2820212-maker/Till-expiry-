import { APP_NAME, APP_VERSION, SUPPORT_EMAIL } from '../appMeta';

describe('appMeta', () => {
  it('APP_VERSION matches app.json and package.json', () => {
    const app = require('../../app.json');
    const pkg = require('../../package.json');
    expect(app.expo.version).toBe(APP_VERSION);
    expect(pkg.version).toBe(APP_VERSION);
  });
  it('has a support address and the product name', () => {
    expect(APP_NAME).toBe('TillExpiry');
    expect(SUPPORT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/i);
  });
});
