import * as React from 'react';
import { render } from '@testing-library/react-native';

import App from './App';

test('renders correctly', () => {
  const { getByTestId, getByText } = render(<App />);
  expect(getByTestId('heading')).toHaveTextContent(
    /NativeWind plus gluestack are wired/i,
  );
  expect(getByText(/Mobile release marker v1\.0\.2/i)).toBeTruthy();
  expect(getByText(/Sync marker: mobile branch refresh ready/i)).toBeTruthy();
  expect(getByText(/GitHub release setup branch active/i)).toBeTruthy();
});
