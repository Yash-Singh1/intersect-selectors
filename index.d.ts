/**
 * Finds the intersection of multiple selectors.
 *
 * @param {...string} selectors A list of selectors to find the intersection of
 * @returns {string | null} The intersection of the selectors
 */
declare const intersectSelectors: (...selectors: string[]) => string;

export default intersectSelectors;
