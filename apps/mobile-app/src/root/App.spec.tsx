import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import mobileAppPackage from '../../package.json';

import App from './App';

test('renders correctly', () => {
  const { getByTestId, getByText } = render(<App />);
  expect(getByTestId('heading')).toHaveTextContent(/Welcome mobile-app/i);
  expect(
    getByText(new RegExp(`v${mobileAppPackage.version}`, 'i')),
  ).toBeTruthy();
  fireEvent.press(getByText(/Open mobile showcase/i));
  expect(getByText(/Gluestack primitives in one place/i)).toBeTruthy();
  expect(getByText(/Input primitives/i)).toBeTruthy();
  expect(getByText(/Badges and status/i)).toBeTruthy();
});
