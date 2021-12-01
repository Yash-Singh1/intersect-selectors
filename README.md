# `intersect-selectors`

Finds the most optimized intersection of any number of CSS Selectors.

## Usage

The function exported returns a string for the selector or an empty string if there is no intersection.

```js
const intersectSelectors = require('intersect-selectors');

intersectSelectors(
  'a + b:nth-child(4) > b',
  'b, c',
  "b:not([attr~='yo']) > b",
  'b',
  'd b'
);

// Result: d a ~ b:nth-child(4):not([attr~='yo']) > b
```
