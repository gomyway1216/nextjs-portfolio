/** Number formatting shared by the three tabs. */

/** A fraction as a percentage to a fixed number of digits: 93.6%, 0.40%. */
export const percent = (fraction: number, digits = 1): string => `${(fraction * 100).toFixed(digits)}%`;

/** A fraction as a percentage with no trailing zeros: 4%, 0.4%, 93.6%. */
export const tidyPercent = (fraction: number, digits = 2): string => `${Number((fraction * 100).toFixed(digits))}%`;
