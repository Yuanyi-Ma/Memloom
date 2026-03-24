import { render, screen, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect } from 'vitest';
import Settings from './Settings';

const mockConfig = {
  apiKey: 'test-key',
  apiUrl: 'https://test.url',
  model: 'test-model',
  extractIntervalMinutes: 30,
  maxNegativeSamples: 50,
  categories: ['test'],
  categoryColors: { test: 'blue' },
  lastExtractTime: new Date().toISOString(),
  initialized: true,
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

vi.mock('../services/api', () => ({
  api: {
    getSkills: vi.fn().mockResolvedValue({ skills: [] }),
    getExtractHistory: vi.fn().mockResolvedValue([]),
  },
}));

describe('Settings Page Redesign', () => {
  const renderSettings = async () => {
    let result: any;
    await act(async () => {
      result = render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>
      );
    });
    return result;
  };

  it('renders a side navigation layout', async () => {
    const { container } = await renderSettings();
    expect(container.querySelector('.settings-layout')).toBeInTheDocument();
    expect(container.querySelector('.settings-sidebar')).toBeInTheDocument();
    const navItems = container.querySelectorAll('.settings-nav-item');
    expect(navItems.length).toBeGreaterThan(0);
  });
});
