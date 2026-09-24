// NOTE: the test timezone is pinned to UTC by the launcher scripts/jest-utc.js
// (wired into the `test` / `test:coverage:gate` npm scripts). It MUST be set
// before Node/V8 first reads the zone — setting process.env.TZ here, inside a
// setupFile, is too late because V8 caches the host zone before setupFiles run and
// the app's date logic uses LOCAL Date getters. Run tests via `npm test`.

// Provide window.location for expo HMR setup that runs during jest-expo preset initialisation.
// The HMR module reads window.location.protocol to build a WebSocket URL; in the Jest Node
// environment window is undefined, so we supply a minimal stub.
if (typeof window === 'undefined') {
  global.window = {};
}
if (!global.window.location) {
  global.window.location = { protocol: 'http:', host: 'localhost', hostname: 'localhost', port: '' };
}
