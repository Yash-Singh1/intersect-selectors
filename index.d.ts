/**
 * Finds the intersection of multiple selectors.
 *
 * @param {...string} selectors A list of selectors to find the intersection of
 * @returns {string | null} The intersection of the selectors, or null if there
 *   is no intersection
 */
declare const intersectSelectors: (...selectors: string[]) => string | null;

export default intersectSelectors;
