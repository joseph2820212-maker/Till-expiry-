// Types for the dependency-free generic build (resolved by metro.config.js and the jest moduleNameMapper).
declare module 'bwip-js/generic' {
  export function toSVG(opts: Record<string, unknown>): string;
}
