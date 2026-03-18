import { render, screen, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect } from 'vitest';
import { MantineProvider } from '@mantine/core';
import Settings from './Settings';

const mockConfig = {
  apiKey: 'test-key',
  apiUrl: 'https://test.url',
  model: 'test-model',
  extractIntervalMinutes: 30,
  maxNegativeSamples: 50,
  categories: ['test'],
  categoryColors: { test: 'blue' },
  lastExtractTime: new Date().toISOString()
};

vi.mock('../hooks/useConfig', () => ({
  useConfig: () => ({
    config: mockConfig,
    loading: false,
    saving: false,
    error: null,
    saveConfig: vi.fn(),
    fetchConfig: vi.fn(),
  }),
}));

describe('Settings Page Redesign', () => {
  const renderSettings = async () => {
    let result: any;
    await act(async () => {
      result = render(
        <MantineProvider>
          <BrowserRouter>
            <Settings />
          </BrowserRouter>
        </MantineProvider>
      );
    });
    return result;
  };

  it('renders a side navigation layout', async () => {
    const { container } = await renderSettings();
    expect(container.querySelector('.settings-layout')).toBeInTheDocument();
    expect(container.querySelector('.settings-sidebar')).toBeInTheDocument();
    
    // Check for navigation items
    const navItems = container.querySelectorAll('.settings-nav-item');
    expect(navItems.length).toBeGreaterThan(0);
  });

  it('renders input fields with glassmorphism glowing styles', async () => {
    const { container } = await renderSettings();
    
    // The inputs should have our custom class applied
    const glassInputs = container.querySelectorAll('.glass-input');
    expect(glassInputs.length).toBeGreaterThan(0);
  });
});
