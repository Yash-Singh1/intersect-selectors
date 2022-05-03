const groupArray = require('group-array');
const mergeArrays = require('merge-array');
const parsel = require('parsel-js');

/**
 * @typedef {Object} SelectorState
 * @property {string} type The tag name of the selector
 * @property {string} pseudoElement The pseudo element of the selector
 * @property {{ name: string; argument: string }[]} pseudoClasses List of
 *   pseudo-classes that the selector matches
 * @property {{
 *   key: string;
 *   operator: '' | '=' | '~=' | '|=' | '^=' | '$=' | '*=';
 *   value: string;
 *   caseSensitive: boolean;
 * }[]} attributes
 *   List of attribute assertions
 */

/**
 * Gives an array of combinations with the length with true-false switches
 *
 * @param {number} length The number of true-false switches per combination
 * @returns {(any[] & { length: length })[]} Combinations of true-false switches
 */
function booleanCombinations(length) {
  let results = [[true], [false]];

  while (results[0].length < length) {
    results = results.reduce((accumulatorResults, booleanSwitches) => {
      accumulatorResults.push(booleanSwitches.concat(true));
      accumulatorResults.push(booleanSwitches.concat(false));
      return accumulatorResults;
    }, []);
  }

  return results;
}

/**
 * Switches the two indexes in the given array
 *
 * @param {any[]} array The array to switch indexes in
 * @param {[number, number]} indexes The indexes to switch
 */
function switchIndexesInArray(array, [index1, index2]) {
  const first = array[index1];
  const second = array[index2];

  array[index1] = second;
  array[index2] = first;

  return array;
}

/**
 * Checks if multiple attribute states of the same key can intersect
 *
 * @param {...SelectorState['attributes'][number]} attributeSelectors
 * @returns {SelectorState['attributes'] | false} Either the optimized attribute
 *   states to put in or false if they don't intersect
 */
function intersectsAttributes(...attributeSelectors) {
  let resultingAttributes = Array.from(attributeSelectors);

  resultingAttributes = resultingAttributes.filter(
    (resultingAttribute) => resultingAttribute.operator !== ''
  );

  // If these attributes just assert existence, e.g. [abc][abc]. return the first one, in our example [abc]
  if (resultingAttributes.length === 0) {
    return attributeSelectors[0];
  }

  // Do some validation on the strict equal attribute checks and find out the asserted case-sensitive/insensitive values
  let sensitiveValue;
  let insensitiveValue;
  for (const attributeSelector of attributeSelectors.filter(
    (attributeSelector) => attributeSelector.operator === '='
  )) {
    if (attributeSelector.caseSensitive) {
      if (sensitiveValue && sensitiveValue !== attributeSelector.value) {
        return false;
      }
      if (
        insensitiveValue &&
        attributeSelector.value.toLowerCase() !== insensitiveValue
      ) {
        return false;
      }
      sensitiveValue = attributeSelector.value;
    } else {
      if (
        sensitiveValue &&
        attributeSelector.value.toLowerCase() !== sensitiveValue.toLowerCase()
      ) {
        return false;
      }
      if (
        insensitiveValue &&
        attributeSelector.value.toLowerCase() !== insensitiveValue
      ) {
        return false;
      }
      insensitiveValue = attributeSelector.value.toLowerCase();
    }
  }

  // If sensitive strict assertion exists then remove insensitive strict assertions
  if (sensitiveValue) {
    resultingAttributes = resultingAttributes.filter((resultingAttribute) =>
      resultingAttribute.operator === '='
        ? resultingAttribute.caseSensitive === true
        : true
    );
  }

  /** All the anchoring (start/end) logic into a separate function because it appears twice */
  function anchoringWork(stringMethod, operator, piping = false) {
    /**
     * Compares if two anchorings are valid together
     *
     * @param {string} anchoring1 The first anchoring
     * @param {string} anchoring2 The second anchoring
     * @returns {boolean} Whether the anchorings are valid together or not
     */
    function compareAnchoring(anchoring1, anchoring2) {
      if (
        (anchoring1.length > anchoring2.length &&
          !anchoring1[stringMethod](anchoring2)) ||
        (anchoring2.length > anchoring1.length &&
          !anchoring2[stringMethod](anchoring1))
      ) {
        return false;
      }
      return true;
    }

    /**
     * Compares if two pipe assertions are valid together
     *
     * @param {string} pipe1 The first pipe
     * @param {string} pipe2 The second pipe
     * @returns {boolean} Whether the pipes are valid together or not
     */
    function comparePipes(pipe1, pipe2) {
      if (pipe1.replace(/-+$/) !== pipe2.replace(/-+$/)) {
        return false;
      }
      return true;
    }

    let anchoringSensitive;
    let anchoringSensitiveIndex = -1;
    let anchoringInsensitive;
    let anchoringInsensitiveIndex = -1;
    let removeIndexAttributes = [];
    let invalid = false;

    /**
     * Edits the existing variables if the newer attribute is more specific
     *
     * @param {Object} resultingAttribute The attribute to compare with the
     *   existing variables
     * @param {number} index The index of the current attribute
     * @param {boolean} sensitive Whether the attribute is case sensitive or not
     * @returns {boolean} Whether the variables were edited or not
     */
    function remakeAnchoringIndexAndValue({ value }, index, sensitive) {
      if (
        value.length >
        (sensitive ? anchoringSensitive : anchoringInsensitive).length
      ) {
        removeIndexAttributes.push(
          sensitive ? anchoringSensitiveIndex : anchoringInsensitiveIndex
        );
        if (sensitive) {
          anchoringSensitive = value;
          anchoringSensitiveIndex = index;
        } else {
          anchoringInsensitive = value;
          anchoringInsensitiveIndex = index;
        }
        return true;
      }
      return false;
    }

    // Filters out redundant assertions and edits variables to get final ones
    resultingAttributes = resultingAttributes.filter(
      (resultingAttribute, resultingAttributeIndex) => {
        if (resultingAttribute.operator === operator) {
          if (resultingAttribute.caseSensitive) {
            if (anchoringInsensitive) {
              if (
                !(piping ? comparePipes : compareAnchoring)(
                  resultingAttribute.value.toLowerCase(),
                  anchoringInsensitive.toLowerCase()
                )
              ) {
                invalid = true;
              }
            }
            if (anchoringSensitive) {
              if (
                !(piping ? comparePipes : compareAnchoring)(
                  anchoringSensitive,
                  resultingAttribute.value
                )
              ) {
                invalid = true;
              } else if (
                !remakeAnchoringIndexAndValue(
                  resultingAttribute,
                  resultingAttributeIndex,
                  true
                )
              ) {
                return false;
              }
            } else {
              anchoringSensitiveIndex = resultingAttributeIndex;
              anchoringSensitive = resultingAttribute.value;
            }
          } else {
            if (anchoringSensitive) {
              if (
                !(piping ? comparePipes : compareAnchoring)(
                  resultingAttribute.value.toLowerCase(),
                  anchoringSensitive.toLowerCase()
                )
              ) {
                invalid = true;
              }
            }
            if (anchoringInsensitive) {
              if (
                !(piping ? comparePipes : compareAnchoring)(
                  resultingAttribute.value.toLowerCase(),
                  anchoringInsensitive.toLowerCase()
                )
              ) {
                invalid = true;
              } else if (
                !remakeAnchoringIndexAndValue(
                  resultingAttribute,
                  resultingAttributeIndex,
                  false
                )
              ) {
                return false;
              }
            } else {
              anchoringInsensitive = resultingAttribute.value;
              anchoringInsensitiveIndex = resultingAttributeIndex;
            }
          }
        }
        return true;
      }
    );

    // Check if any invalidation occurred or if the anchoring assertions don't match with the equal ones
    if (invalid) {
      return false;
    } else if (
      anchoringSensitive &&
      anchoringInsensitive &&
      !(piping ? comparePipes : compareAnchoring)(
        anchoringSensitive.toLowerCase(),
        anchoringInsensitive.toLowerCase()
      )
    ) {
      return false;
    } else if (sensitiveValue || insensitiveValue) {
      if (
        sensitiveValue &&
        (!sensitiveValue[stringMethod](anchoringSensitive || '') ||
          !sensitiveValue.toLowerCase()[stringMethod](insensitiveValue || ''))
      ) {
        return false;
      }
      if (
        insensitiveValue &&
        (!insensitiveValue[stringMethod](
          anchoringSensitive.toLowerCase() || ''
        ) ||
          !insensitiveValue[stringMethod](
            anchoringInsensitive.toLowerCase() || ''
          ))
      ) {
        return false;
      }

      // Remove respective anchoring assertions (unless we have a insensitive value + sensitive anchoring)
      if (
        sensitiveValue ||
        (insensitiveValue && anchoringInsensitive && !anchoringSensitive)
      ) {
        resultingAttributes = resultingAttributes.filter(
          (resultingAttribute) => resultingAttribute.operator !== operator
        );
      }

      // Remove insensitive respective anchoring if we have sensitive more or equal describing
      if (
        insensitiveValue &&
        !sensitiveValue &&
        anchoringSensitive &&
        anchoringInsensitive &&
        anchoringSensitive.length >= anchoringInsensitive.length
      ) {
        resultingAttributes = resultingAttributes.filter((resultingAttribute) =>
          resultingAttribute.operator === operator
            ? resultingAttribute.caseSensitive
            : true
        );
      }
    }

    resultingAttributes = resultingAttributes.filter(
      (_resultingAttribute, resultingAttributeIndex) =>
        !removeIndexAttributes.includes(resultingAttributeIndex)
    );

    return [anchoringSensitive, anchoringInsensitive];
  }

  // Do starting assertion validation '^='

  const startAnchoringResult = anchoringWork('startsWith', '^=');

  let startingSensitive;
  let startingInsensitive;
  if (startAnchoringResult) {
    startingSensitive = startAnchoringResult[0];
    startingInsensitive = startAnchoringResult[1];
  } else {
    return false;
  }

  // Check the '*=' assertions

  let sensitiveIncludes = [];
  let insensitiveIncludes = [];

  /**
   * Compares two includes assertions
   *
   * @param {string} value1 The first value
   * @param {string} value2 The second value
   * @returns {-1 | 0 | 1 | null} -1 if smaller, 0 if equal, 1 if larger, null
   *   if nowhere near
   */
  function compareIncludes(value1, value2) {
    if (value1 === value2) {
      return 0;
    } else if (value1.includes(value2)) {
      return 1;
    } else if (value2.includes(value1)) {
      return -1;
    }
    return null;
  }

  resultingAttributes.forEach((resultingAttribute) => {
    if (resultingAttribute.operator === '*=') {
      if (resultingAttribute.caseSensitive) {
        if (
          sensitiveIncludes.find((sensitiveInclusion) =>
            [0, 1].includes(
              compareIncludes(
                sensitiveInclusion.toLowerCase(),
                resultingAttribute.value.toLowerCase()
              )
            )
          )
        ) {
          return;
        }
        match = false;
        sensitiveIncludes
          .map(
            (sensitiveInclusion) =>
              compareIncludes(sensitiveInclusion, resultingAttribute.value) ===
              -1
          )
          .forEach((comparison, comparisonIndex) => {
            if (comparison) {
              match = true;
              sensitiveIncludes[comparisonIndex] = resultingAttribute.value;
            }
          });
        if (!match) {
          sensitiveIncludes.push(resultingAttribute.value);
        }
        sensitiveIncludes = [...new Set(sensitiveIncludes)];
        insensitiveIncludes = insensitiveIncludes.filter(
          (insensitiveInclusion) => {
            const comparison = compareIncludes(
              insensitiveInclusion,
              resultingAttribute.value.toLowerCase()
            );
            if (comparison === null || comparison === 1) {
              return true;
            }
            return false;
          }
        );
      } else if (
        !sensitiveIncludes.find((sensitiveInclusion) =>
          [0, 1].includes(
            compareIncludes(
              sensitiveInclusion.toLowerCase(),
              resultingAttribute.value.toLowerCase()
            )
          )
        ) &&
        !insensitiveIncludes.find((insensitiveInclusion) =>
          [0, 1].includes(
            compareIncludes(
              insensitiveInclusion,
              resultingAttribute.value.toLowerCase()
            )
          )
        )
      ) {
        match = false;
        insensitiveIncludes
          .map(
            (insensitiveInclusion) =>
              compareIncludes(
                insensitiveInclusion,
                resultingAttribute.value.toLowerCase()
              ) === -1
          )
          .forEach((comparison, comparisonIndex) => {
            if (comparison) {
              match = true;
              insensitiveIncludes[comparisonIndex] =
                resultingAttribute.value.toLowerCase();
            }
          });
        if (!match) {
          insensitiveIncludes.push(resultingAttribute.value.toLowerCase());
        }
        insensitiveIncludes = [...new Set(insensitiveIncludes)];
      }
    }
  });

  // Validate the includes assertions for any conflicts with the equals assertions
  if (sensitiveValue || insensitiveValue) {
    if (
      sensitiveValue &&
      (!sensitiveIncludes.every((sensitiveInclusion) =>
        sensitiveValue.includes(sensitiveInclusion)
      ) ||
        !insensitiveInclusion.every((insensitiveInclusion) =>
          sensitiveValue.toLowerCase().includes(insensitiveInclusion)
        ))
    ) {
      return false;
    }

    if (
      insensitiveValue &&
      (!sensitiveIncludes.every((sensitiveInclusion) =>
        insensitiveValue.includes(sensitiveInclusion.toLowerCase())
      ) ||
        !insensitiveIncludes.every((insensitiveInclusion) =>
          insensitiveValue.includes(insensitiveInclusion)
        ))
    ) {
      return false;
    }

    resultingAttributes = resultingAttributes.filter(
      (resultingAttribute) => resultingAttribute.operator !== '*='
    );
    resultingAttributes = [
      ...resultingAttributes,
      ...(sensitiveValue
        ? []
        : [
            ...sensitiveIncludes.map((sensitiveInclusion) => ({
              key: attributeSelectors[0].key,
              operator: '*=',
              value: sensitiveInclusion,
              caseSensitive: true
            })),
            ...(insensitiveValue
              ? []
              : insensitiveIncludes.map((insensitiveInclusion) => ({
                  key: attributeSelectors[0].key,
                  operator: '*=',
                  value: insensitiveInclusion,
                  caseSensitive: false
                })))
          ])
    ];
  }

  // Check the '$=' assertions

  const endAnchoringResult = anchoringWork('endsWith', '$=');

  let endingSensitive;
  let endingInsensitive;
  if (endAnchoringResult) {
    endingSensitive = endAnchoringResult[0];
    endingInsensitive = endAnchoringResult[1];
  } else {
    return false;
  }

  // Check the '|=' assertions

  const pipeAnchoringResult = anchoringWork('startsWith', '|=', true);

  let pipeSensitive;
  let pipeInsensitive;
  if (pipeAnchoringResult) {
    pipeSensitive = pipeAnchoringResult[0];
    pipeInsensitive = pipeAnchoringResult[1];
  } else {
    return false;
  }

  // Edit the attributes to contain required pipe assertions only
  if (pipeSensitive && pipeInsensitive) {
    if (pipeSensitive.length >= pipeInsensitive.length) {
      resultingAttributes = resultingAttributes.filter((resultingAttribute) =>
        resultingAttribute.operator === '|='
          ? resultingAttribute.caseSensitive &&
            resultingAttribute.value === pipeSensitive
          : true
      );
    }
  } else if (pipeSensitive || pipeInsensitive) {
    resultingAttributes = resultingAttributes.filter((resultingAttribute) =>
      resultingAttribute.operator === '|='
        ? resultingAttribute.value === pipeSensitive
        : true
    );
  }

  // Validate other assertions with the pipe assertion

  if (
    (pipeSensitive || pipeInsensitive) &&
    (sensitiveValue || insensitiveValue)
  ) {
    if (sensitiveValue) {
      if (
        !sensitiveValue.startsWith(pipeSensitive || '') ||
        !sensitiveValue.toLowerCase().startsWith(pipeInsensitive.toLowerCase())
      ) {
        return false;
      }

      if (
        (sensitiveValue !== pipeSensitive &&
          !sensitiveValue.startsWith(pipeSensitive + '-')) ||
        (sensitiveValue.toLowerCase() !== pipeInsensitive.toLowerCase() &&
          !sensitiveValue
            .toLowerCase()
            .startsWith(pipeInsensitive.toLowerCase() + '-'))
      ) {
        return false;
      }
    }

    if (insensitiveValue) {
      if (
        !insensitiveValue.startsWith(pipeSensitive || '') ||
        !insensitiveValue.startsWith(pipeInsensitive.toLowerCase())
      ) {
        return false;
      }

      if (
        (insensitiveValue !== pipeSensitive.toLowerCase() &&
          !insensitiveValue.startsWith(pipeSensitive.toLowerCase() + '-')) ||
        (insensitiveValue !== pipeInsensitive.toLowerCase() &&
          !insensitiveValue.startsWith(pipeInsensitive.toLowerCase() + '-'))
      ) {
        return false;
      }
    }
  }

  if (startingSensitive) {
    if (pipeSensitive) {
      if (startingSensitive.length <= pipeSensitive.length) {
        if (!pipeSensitive.startsWith(startingSensitive)) {
          return false;
        }
        resultingAttributes = resultingAttributes.filter(
          (resultingAttribute) => resultingAttribute.operator !== '^='
        );
      } else {
        if (!startingSensitive.startsWith(pipeSensitive + '-')) {
          return false;
        }
        resultingAttributes = resultingAttributes.filter(
          (resultingAttribute) => resultingAttribute.operator !== '|='
        );
      }
    }

    if (pipeInsensitive) {
      if (startingSensitive.length <= pipeInsensitive.length) {
        if (
          !pipeInsensitive
            .toLowerCase()
            .startsWith(startingSensitive.toLowerCase())
        ) {
          return false;
        }
        resultingAttributes = resultingAttributes.filter(
          (resultingAttribute) => resultingAttribute.operator !== '^='
        );
      } else {
        if (
          !startingSensitive
            .toLowerCase()
            .startsWith(pipeInsensitive.toLowerCase() + '-')
        ) {
          return false;
        }
        resultingAttributes = resultingAttributes.filter(
          (resultingAttribute) => resultingAttribute.operator !== '|='
        );
      }
    }
  }

  if (startingInsensitive) {
    if (pipeSensitive) {
      if (startingInsensitive.length <= pipeSensitive.length) {
        if (
          !pipeSensitive
            .toLowerCase()
            .startsWith(startingInsensitive.toLowerCase())
        ) {
          return false;
        }
        resultingAttributes = resultingAttributes.filter(
          (resultingAttribute) => resultingAttribute.operator !== '^='
        );
      } else {
        if (
          !startingInsensitive
            .toLowerCase()
            .startsWith(pipeSensitive.toLowerCase() + '-')
        ) {
          return false;
        }
        resultingAttributes = resultingAttributes.filter(
          (resultingAttribute) => resultingAttribute.operator !== '|='
        );
      }
    }

    if (pipeInsensitive) {
      if (startingInsensitive.length <= pipeInsensitive.length) {
        if (
          !pipeInsensitive
            .toLowerCase()
            .startsWith(startingInsensitive.toLowerCase())
        ) {
          return false;
        }
        resultingAttributes = resultingAttributes.filter(
          (resultingAttribute) => resultingAttribute.operator !== '^='
        );
      } else {
        if (
          !startingInsensitive
            .toLowerCase()
            .startsWith(pipeInsensitive.toLowerCase() + '-')
        ) {
          return false;
        }
        resultingAttributes = resultingAttributes.filter(
          (resultingAttribute) => resultingAttribute.operator !== '|='
        );
      }
    }
  }

  // Check the '~=' assertion

  let insensitiveWords = [];
  let sensitiveWords = [];

  resultingAttributes = resultingAttributes.filter((resultingAttribute) => {
    if (resultingAttribute.caseSensitive) {
      if (sensitiveWords.includes(resultingAttribute.value)) {
        return false;
      }
      sensitiveWords.push(resultingAttribute.value);
      return true;
    } else {
      if (insensitiveWords.includes(resultingAttribute.value)) {
        return false;
      }
      insensitiveWords.push(resultingAttribute.value);
      return true;
    }
  });

  return resultingAttributes;
}

/**
 * Extracts information on given tokens
 *
 * @param {any[]} tokens
 * @returns {SelectorState} The state for the tokens
 */
function extractInfo(tokens) {
  const state = {
    pseudoClasses: [],
    attributes: []
  };

  tokens.forEach((token) => {
    switch (token.type) {
      case 'pseudo-element':
        state.pseudoElement = token.name;
        break;

      case 'type':
        state.type = token.name;
        break;

      case 'class':
        state.attributes.push({
          key: 'class',
          operator: '~=',
          value: token.name,
          caseSensitive: true
        });
        break;

      case 'pseudo-class':
        state.pseudoClasses.push({
          name: token.name,
          argument: token.argument
        });
        break;

      case 'id':
        state.attributes.push({
          key: 'id',
          operator: '=',
          value: token.name,
          caseSensitive: true
        });
        break;

      case 'attribute':
        state.attributes.push({
          key: token.name,
          operator: token.operator || '',
          value: token.value.replace(/^('(.*?)'|"(.*?)")$/, '$2'),
          caseSensitive: token.caseSensitive
            ? token.caseSensitive.toLowerCase() === 'i'
              ? false
              : true
            : true
        });
        break;
    }
  });

  return state;
}

/**
 * Checks if two selector states have an intersection
 *
 * @param {SelectorState} token1 The first selector state
 * @param {SelectorState} token2 The second selector state
 * @returns {SelectorState | false} False if they don't intersect, or else a
 *   selector state
 */
function intersects(token1, token2) {
  const finalState = {};

  if (token1.type !== token2.type) {
    if (
      token1.type &&
      token2.type &&
      token1.type !== '*' &&
      token2.type !== '*'
    ) {
      return false;
    }
  } else {
    finalState.type = token1.type || token2.type;
  }

  if (!finalState.type) {
    if (token1.type && token1.type !== '*') {
      finalState.type = token1.type;
    } else if (token2.type && token2.type !== '*') {
      finalState.type = token2.type;
    } else if (token1.type || token2.type) {
      finalState.type = '*';
    }
  }

  if (token1.pseudoElement !== token2.pseudoElement) {
    if (token1.pseudoElement && token2.pseudoElement) {
      return false;
    }
  } else if (token1.pseudoElement) {
    finalState.pseudoElement = token1.pseudoElement;
  }

  finalState.pseudoClasses = [
    ...new Set(token1.pseudoClasses.concat(token2.pseudoClasses))
  ];
  finalState.attributes = Object.values(
    groupArray([...token1.attributes, ...token2.attributes], 'operator')
  ).map((attributeGroup) => intersectsAttributes(...attributeGroup));

  if (finalState.attributes.includes(false)) {
    return false;
  } else {
    finalState.attributes =
      finalState.attributes.length > 0
        ? mergeArrays(...finalState.attributes)
        : [];
  }

  return finalState;
}

/**
 * Stringifies the state of a selector
 *
 * @param {SelectorState} state The state to stringify
 * @returns {string} The stringified selector
 */
function stringifyState(state) {
  let result = '';

  if (state.type) {
    result = state.type;
  }

  if (state.pseudoElement) {
    result += `::${state.pseudoElement}`;
  }

  const classes = [];
  const ids = [];
  let attributeResult = '';
  state.attributes.forEach((attribute) => {
    if (attribute.operator === '~=' && attribute.key === 'class') {
      classes.push(attribute.value);
    } else if (attribute.operator === '=' && attribute.key === 'id') {
      ids.push(attribute.value);
    } else if (attribute.operator === '') {
      attributeResult += `[${attribute.key}]`;
    } else if (attribute.value.includes("'")) {
      if (attribute.value.includes('"')) {
        attributeResult += `[${attribute.key}${attribute.operator}${
          attribute.value
        }${attribute.caseSensitive ? '' : ' i'}]`;
      } else {
        attributeResult += `[${attribute.key}${attribute.operator}="${
          attribute.value
        }"${attribute.caseSensitive ? '' : ' i'}]`;
      }
    } else {
      attributeResult += `[${attribute.key}${attribute.operator}'${
        attribute.value
      }'${attribute.caseSensitive ? '' : ' i'}]`;
    }
  });

  classes.forEach((cssClass) => {
    result += `.${cssClass}`;
  });

  result = result + attributeResult;

  state.pseudoClasses.forEach((pseudoClass) => {
    result += `:${pseudoClass.name}${
      pseudoClass.argument ? `(${pseudoClass.argument})` : ''
    }`;
  });

  ids.forEach((id) => {
    result += `#${id}`;
  });

  return result;
}

function intersectSelectors(...selectors) {
  // Recursively find intersection of rest first
  if (selectors.length !== 2) {
    selectors = [selectors[0], intersectSelectors(...selectors.slice(1))];
  } else if (selectors.length === 1) {
    return selectors[0];
  }

  // If no intersection then say so
  if (selectors.includes('')) {
    return '';
  }

  let parsed = selectors.map(parsel.tokenize);

  // Split into array of comma-separated selectors
  parsed = parsed.map((parsedSelector) =>
    parsedSelector.reduce(
      (accumulatorParts, part) =>
        part.type === 'comma'
          ? [...accumulatorParts, []]
          : [
              ...accumulatorParts.slice(0, -1),
              accumulatorParts.slice(-1)[0].concat(part)
            ],
      [[]]
    )
  );

  // parsed, right now:
  // Array<       // The main array of selectors
  //   Array<     // An array of comma-separated subselectors
  //     Array<   // An array of tokens in those subselectors
  //       Token
  //     >
  //   >
  // >

  // If the selector is comma-separated, map each part onto each one of the others
  // E.g.
  // (a ∪ b) ∩ (c ∪ d)
  // a --------> c <-|
  //   |---------▼   |
  // b --------> d   |
  // |----------------
  // This will be ('a' ∩ 'c') ∪ ('a' ∩ 'd') ∪ ('b' ∩ 'c') ∪ ('b' ∩ 'd')
  // Basically the distributive property applied in set theory
  if (parsed.find((parsedSelector) => parsedSelector.length > 1)) {
    let parsedMap = parsed[0].reduce((accumulatorMap, currentlyParsed) => {
      parsed[1].forEach((secondParsedSelector) => {
        accumulatorMap.push([currentlyParsed, secondParsedSelector]);
      });
      return accumulatorMap;
    }, []);
    parsedMap = parsedMap.map((parsedMapEntry) =>
      intersectSelectors(
        ...parsedMapEntry.map((parsedMapEntryPart) =>
          parsedMapEntryPart
            .map((parsedMapEntryPartToken) => parsedMapEntryPartToken.content)
            .join('')
        )
      )
    );
    return parsedMap.filter((intersection) => intersection !== '').join(', ');
  } else {
    // Do the real stuff here

    // We are flattening because there is a redundant Array in between
    // Reversing because the end result lies in the end part of the selector
    // The starting can be a parent or the result
    parsed = parsed.map((parsedSelector) => parsedSelector[0].reverse());

    // Group siblings and split by combinators
    parsed = parsed.map((parsedSelector) =>
      parsedSelector.reduce(
        (accumulatorParts, part) =>
          part.type === 'combinator'
            ? ['~', '+'].includes(part.content)
              ? [
                  ...accumulatorParts.slice(0, -1),
                  {
                    type: accumulatorParts.slice(-1)[0].type,
                    tokens: [...accumulatorParts.slice(-1)[0].tokens, []]
                  }
                ]
              : [
                  ...accumulatorParts,
                  {
                    type: part.content === '>' ? 'parent' : 'ancestor',
                    tokens: []
                  }
                ]
            : [
                ...accumulatorParts.slice(0, -1),
                {
                  type: accumulatorParts.slice(-1)[0].type,
                  tokens: [
                    ...accumulatorParts.slice(-1)[0].tokens.slice(0, -1),
                    [
                      ...(accumulatorParts.slice(-1)[0].tokens.slice(-1)[0] ||
                        []),
                      part
                    ]
                  ]
                }
              ],
        [{ type: '', tokens: [] }]
      )
    );

    // Ensure same depth for both selectors, e.g. a > b and c ---> a > b and * > c
    if (parsed[0].length !== parsed[1].length) {
      const editedPart = parsed[0].length > parsed[1].length ? 1 : 0;
      parsed[editedPart] = [
        ...parsed[editedPart],
        ...parsed[editedPart === 0 ? 1 : 0]
          .slice(parsed[editedPart].length)
          .map((parsedSelectorPart) => ({
            ...parsedSelectorPart,
            tokens: [[{ type: 'type', content: '*', name: '*' }]]
          }))
      ];
    }

    // Extract info as an object for tokens
    parsed = parsed.map((parsedSelector) =>
      parsedSelector.map((parsedSelectorSiblingGroup) => ({
        ...parsedSelectorSiblingGroup,
        tokens: parsedSelectorSiblingGroup.tokens.map((sibling) =>
          extractInfo(sibling)
        )
      }))
    );

    // Now parsed is:
    // Array<                    // The main array of selectors
    //   Array<                  // Arrays of sibling groups
    //     {
    //       type: string;       // Type of relationship change, parent or ancestor or empty string for none
    //       tokens: Array<      // Array of selector states on siblings
    //         SelectorState     // See `extractInfo`
    //       >
    //     }
    //   >
    // >

    let parsedSideBySide = Array.from(parsed[0]);

    // Merges the two arrays so we can look at corresponding values while iterating it
    parsed[1].forEach((parsedSelectorPart, parsedSelectorPartIndex) => {
      parsedSideBySide[parsedSelectorPartIndex] = [
        parsedSideBySide[parsedSelectorPartIndex],
        parsedSelectorPart
      ];
    });

    parsedSideBySide = parsedSideBySide.map((parsedSiblingGroup) => {
      if (parsedSiblingGroup[0].type !== parsedSiblingGroup[1].type) {
        return [
          {
            states:
              parsedSiblingGroup[
                parsedSiblingGroup[0].type === 'parent' ? 1 : 0
              ].tokens,
            combinator: ' '
          },
          {
            states:
              parsedSiblingGroup[
                parsedSiblingGroup[0].type === 'parent' ? 0 : 1
              ].tokens,
            combinator: '>'
          }
        ];
      } else if (parsedSiblingGroup[0].type === 'ancestor') {
        return [
          { states: parsedSiblingGroup[0].tokens.reverse(), combinator: ' ' },
          { states: parsedSiblingGroup[1].tokens.reverse(), combinator: ' ' }
        ].filter((group) => group.states[0].type !== '*');
      }

      const intersection = intersects(
        parsedSiblingGroup[0].tokens[0],
        parsedSiblingGroup[1].tokens[0]
      );

      if (intersection) {
        return {
          states: [
            ...parsedSiblingGroup[1].tokens.slice(1),
            ...parsedSiblingGroup[0].tokens.slice(1),
            intersection
          ],
          combinator:
            parsedSiblingGroup[0].type === 'parent'
              ? '>'
              : parsedSiblingGroup[0].type === 'ancestor'
              ? ' '
              : ''
        };
      } else {
        return false;
      }
    });

    if (parsedSideBySide.includes(false)) {
      return '';
    } else {
      let switchIndexes = [];
      const result = parsedSideBySide
        .reverse()
        .reduce((accumulatorSiblingGroups, siblingGroup) => {
          if (Array.isArray(siblingGroup)) {
            accumulatorSiblingGroups =
              accumulatorSiblingGroups.concat(siblingGroup);
            if (
              siblingGroup.every(
                (siblingGroupPart) => siblingGroupPart.combinator === ' '
              ) &&
              siblingGroup.length === 2
            ) {
              switchIndexes.push(accumulatorSiblingGroups.length - 2);
            }
          } else {
            accumulatorSiblingGroups.push(siblingGroup);
          }
          return accumulatorSiblingGroups;
        }, []);

      switchIndexes = booleanCombinations(switchIndexes.length).map(
        (booleanCombination) => {
          if (typeof switchIndexes[0] === 'undefined') {
            return false;
          }
          let innerResult = Array.from(result);
          booleanCombination.forEach(
            (booleanCombinationSwitch, booleanCombinationSwitchIndex) => {
              if (booleanCombinationSwitch) {
                innerResult = switchIndexesInArray(innerResult, [
                  switchIndexes[booleanCombinationSwitchIndex],
                  switchIndexes[booleanCombinationSwitchIndex] + 1
                ]);
              }
            }
          );
          return innerResult;
        }
      );

      return (switchIndexes.includes(false) ? [result] : switchIndexes)
        .map((result) =>
          result
            .map(
              (siblingGroup) =>
                `${siblingGroup.states.map(stringifyState).join(' ~ ')}${
                  siblingGroup.combinator !== ''
                    ? `${siblingGroup.combinator === '>' ? ' > ' : ' '}`
                    : ''
                }`
            )
            .join('')
        )
        .join(', ');
    }
  }
}

module.exports = intersectSelectors;
