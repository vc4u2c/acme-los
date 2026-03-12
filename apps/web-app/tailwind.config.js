const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, 'src/**/*.{ts,tsx,js,jsx,mdx,html}'),
    path.join(__dirname, 'app/**/*.{ts,tsx,js,jsx,mdx,html}'),
    path.join(__dirname, 'components/**/*.{ts,tsx,js,jsx,mdx,html}'),
    path.join(__dirname, '../../libs/**/*.{ts,tsx,js,jsx,mdx,html}'),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
