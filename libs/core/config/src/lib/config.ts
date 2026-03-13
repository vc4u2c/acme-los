export interface AppRuntimeConfig {
  environment: 'development' | 'test' | 'production';
  apiBaseUrl: string;
  enableMockData: boolean;
}

export function getDefaultRuntimeConfig(): AppRuntimeConfig {
  return {
    environment: 'development',
    apiBaseUrl: 'http://localhost:3000/api',
    enableMockData: true,
  };
}
