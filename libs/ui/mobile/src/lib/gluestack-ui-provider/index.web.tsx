'use client';
import React from 'react';
import { OverlayProvider } from '@gluestack-ui/overlay';
import { ToastProvider } from '@gluestack-ui/toast';
import { config } from './config';

export function GluestackUIProvider({
  mode = 'light',
  ...props
}: {
  mode?: 'light' | 'dark';
  children?: React.ReactNode;
}) {
  if (config[mode] && typeof document !== 'undefined') {
    const element = document.documentElement;

    if (element) {
      const head = element.querySelector('head');
      const style = document.createElement('style');
      const cssVars = Object.keys(config[mode]).reduce((acc, key) => {
        acc += `${key}:${config[mode][key]};`;
        return acc;
      }, '');

      style.innerHTML = `:root {${cssVars}} `;

      if (head) {
        head.appendChild(style);
      }
    }
  }

  return (
    <OverlayProvider>
      <ToastProvider>{props.children}</ToastProvider>
    </OverlayProvider>
  );
}
