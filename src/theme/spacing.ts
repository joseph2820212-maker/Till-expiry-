/**
 * spacing.ts — responsive spacing tokens
 *
 * All values scale with screen width via rs().
 * At 360dp: ≈ 92% of base. At 430dp: ≈ 110% of base.
 */

import { rs } from './responsive';

export const spacing = {
  // Named scale
  xxs:  rs(4),
  xs:   rs(6),
  sm:   rs(8),
  md:   rs(12),
  lg:   rs(16),
  xl:   rs(20),
  xxl:  rs(24),
  xxxl: rs(32),

  // Semantic aliases (backward-compatible)
  screenPadding: rs(16),
  cardPadding:   rs(16),
  sectionGap:    rs(18),
  rowGap:        rs(10),
  cardGap:       rs(12),
  scrollBottom:  rs(120),
};
