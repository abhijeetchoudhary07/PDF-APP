// @ts-check
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = tseslint.config(
  {
    ignores: ["projects/**/*", "android/**/*", "www/**/*", "dist/**/*", "coverage/**/*", "videos/**/*"]
  },
  {
    files: ["**/*.ts"],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      /*
       * Angular 22 made OnPush the default change-detection strategy, and this
       * lint rule enforces it. Every component here sets
       * ChangeDetectionStrategy.Eager on purpose: the app's state is plain
       * mutable component fields updated from async continuations (pdf-lib,
       * pdf.js, image compression), which OnPush never marks dirty — under the
       * new default the UI silently stopped repainting after a file was chosen.
       *
       * Re-enable this rule once component state has been migrated to signals,
       * at which point OnPush becomes both correct and faster.
       *
       * That migration is deliberately not part of the release work: it is 73
       * components, it changes how every screen updates, and the failure mode
       * it risks is the one described above -- a view that silently stops
       * repainting, which no test in this repo would catch. `prefer-standalone`
       * was the half of this modernisation that could be finished safely, and
       * it is on again below by virtue of not being listed here.
       */
      "@angular-eslint/prefer-on-push-component-change-detection": "off",
      "@angular-eslint/component-class-suffix": [
        "error",
        { suffixes: ["Page", "Component"] },
      ],
      "@angular-eslint/component-selector": [
        "error",
        { type: "element", prefix: "app", style: "kebab-case" },
      ],
      "@angular-eslint/directive-selector": [
        "error",
        { type: "attribute", prefix: "app", style: "camelCase" },
      ],
    },
  },
  {
    files: ["**/*.html"],
    extends: [...angular.configs.templateRecommended],
    rules: {},
  },
  {
    /*
     * The Playwright suite, which `ng lint` did not look at until now.
     *
     * A test whose body hangs off `if (await locator.isVisible())` does not
     * skip a step when the element is missing -- it skips the assertions too,
     * and reports a pass. Twenty-eight of these had accumulated: one had never
     * exported the ZIP it was named after, one asserted nothing whatsoever, and
     * a whole scanner suite was green over a file input that is never in the
     * DOM. None of them could fail, which is the only thing a test is for.
     *
     * `isVisible()` and `count()` are one-shot reads rather than web-first
     * assertions, so they are also a race even when the element does turn up.
     * `await expect(locator).toBeVisible()` retries and fails loudly; for a
     * genuinely optional element, assert the branch you expect to be in.
     */
    files: ["e2e/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "IfStatement > AwaitExpression > CallExpression > MemberExpression[property.name=/^(isVisible|isHidden|isEnabled|isDisabled|isChecked|isEditable)$/]",
          message:
            "A one-shot isVisible()/isEnabled() guard skips the assertions with it. Use `await expect(locator).toBeVisible()` (or .toBeEnabled()) instead.",
        },
        {
          selector:
            "IfStatement > BinaryExpression > AwaitExpression > CallExpression > MemberExpression[property.name='count']",
          message:
            "A `count()` guard passes the test when the element is absent. Assert what you expect: `await expect(locator).toHaveCount(n)`.",
        },
        {
          selector:
            "IfStatement > LogicalExpression AwaitExpression > CallExpression > MemberExpression[property.name=/^(isVisible|isEnabled|count)$/]",
          message:
            "A one-shot visibility/count check in a compound condition skips the assertions with it. Assert instead.",
        },
      ],
    },
  }
);
