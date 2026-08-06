// Pragmatic ESLint for the viewer's browser JS. Intentionally minimal: catch real
// "undefined reference" bugs (no-undef = error) and flag dead bindings as warnings
// (no-unused-vars = warn). Style nits are left alone. Vendored three + the build
// output are not our code, so they're ignored.
import globals from "globals";

const browserAppGlobals = {
  ...globals.browser,
  // Globals published by the sibling non-module scripts (permissions.js /
  // error_codes.js) and by the machine link, read from urdf_viewer.js.
  MeltioPermissions: "readonly",
  MeltioErrorCodes: "readonly",
  MeltioMachineLink: "writable",
  THREE: "readonly",
};

export default [
  { ignores: ["**/vendor/**", "**/dist/**", "node_modules/**"] },

  // ES-module app code (the bundle graph).
  {
    files: [
      "apps/dev-host/src/avisualizer/web/static/urdf_viewer.js",
      "apps/dev-host/src/avisualizer/web/static/modules/**/*.js",
      "hmi/**/*.js",
      "viewer/**/*.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: browserAppGlobals,
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "warn",
    },
  },

  // Classic (non-module) global scripts loaded directly in the page.
  {
    files: [
      "hmi/permissions.js",
      "hmi/error_codes.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: browserAppGlobals,
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "warn",
    },
  },
];
