# Coding standards

Read during review. Each rule says what to look for in a diff and what the fix is.

## Comments

Code carries no comments. Each thing a comment would say has a home that can't go stale silently:

| A comment would say… | Put it here instead |
| --- | --- |
| **why** a choice was made, when it is hard to reverse, surprising, and the result of a real trade-off | an ADR in `docs/adr/`, shaped like the ones there: a title that states the decision, a short paragraph, optional Consequences |
| **what** a value or step means | a name: a constant (`UNREACHABLE_RUNPOD`, `PNG_BIT_DEPTH`), a function (`failAtBootIfMisconfigured`), a variable (`advancedHasErrors`) |
| that two places **must agree** | a test that fails when they drift (`web/test/worker-limits.test.ts`) |
| why a test **asserts** something | the assertion's message argument |
| why a workflow **step** exists | the step's `name:` |
| **how to use** a script or option | the README next to it |
| nothing the code doesn't already say | delete it |

When a review finds a comment, the fix is to move it to one of these homes, not to reword it.

## Type assertions

TypeScript uses no type assertions (`value as T`, `<T>value`) outside shared utilities. `as const` and `satisfies` are fine.

Narrow instead: `instanceof`, `typeof`, `in`, a type guard, or a declaration. Where trusting a type without a check can't be avoided, wrap the assertion in a small named function in the shared utilities, so every unchecked trust is one search away. Review checks that no check could replace it.

Enforced by `@typescript-eslint/consistent-type-assertions` with `assertionStyle: "never"`, switched off for the shared utilities folder.
