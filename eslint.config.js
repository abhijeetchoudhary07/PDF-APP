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
       * That migration is deliberately not part of the release work: it is 79
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
  }
);
