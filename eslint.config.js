// @ts-check
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = tseslint.config(
  {
    files: ["**/*.ts"],
    ignores: ["projects/**/*"],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/prefer-standalone": "off",
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
  }
);
