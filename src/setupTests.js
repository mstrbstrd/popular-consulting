// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { configureAxe } from 'jest-axe';

// Configure axe with reasonable rule set for this project.
// Disable rules that don't apply in JSDOM (e.g. color-contrast needs real CSS):
configureAxe({
  rules: {
    'color-contrast': { enabled: false }, // Requires real CSS rendering — tested in 08_color_contrast.test.js
    'scrollable-region-focusable': { enabled: false }, // overflow:hidden regions are intentional
  },
});
