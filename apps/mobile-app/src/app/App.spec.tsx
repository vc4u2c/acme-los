import * as React from 'react';
import { render } from '@testing-library/react-native';
import mobileAppPackage from '../../package.json';

import App from './App';

test('renders correctly', () => {
  const { getByTestId, getByText } = render(<App />);
  expect(getByTestId('heading')).toHaveTextContent(
    /NativeWind plus gluestack are wired/i,
  );
  expect(
    getByText(
      new RegExp(`Mobile release marker v${mobileAppPackage.version}`, 'i'),
    ),
  ).toBeTruthy();
  expect(getByText(/Sync marker: mobile branch refresh ready/i)).toBeTruthy();
  expect(getByText(/GitHub release setup branch active/i)).toBeTruthy();
  expect(getByText(/Deploy artifact label update ready/i)).toBeTruthy();
});
