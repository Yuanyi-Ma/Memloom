import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect } from 'vitest';
import Home from './Home';

// Mock dependencies
vi.mock('../hooks/useStats', () => ({
  useStats: () => ({
    stats: {
      totalCards: 10,
      masteredCards: 5,
      dueToday: 5,
      newToday: 0,
    },
    history: [{ date: '2023-11-01', count: 2 }],
    loading: false,
  }),
}));

vi.mock('../hooks/useConfig', () => ({
  useConfig: () => ({
    config: { categories: ['test'], categoryColors: { test: 'blue' }, initialized: true },
    loading: false,
    saving: false,
    saveConfig: vi.fn(),
    fetchConfig: vi.fn(),
  }),
}));

vi.mock('../services/api', () => ({
  api: {
    getCards: vi.fn().mockResolvedValue({ cards: [{ id: 1 }, { id: 2 }] }),
  },
}));

// Mock Recharts to avoid container size issues in JSDOM
vi.mock('recharts', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  };
});

describe('Home Page Redesign', () => {
  const renderHome = () => {
    return render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
  };

  it('renders the main 忆织 title', () => {
    renderHome();
    expect(screen.getByText('忆织')).toBeInTheDocument();
  });

  it('contains bento-grid and glass-card styling classes', () => {
    const { container } = renderHome();
    const bentoGrid = container.querySelector('.bento-grid');
    expect(bentoGrid).toBeInTheDocument();
    const glassCards = container.querySelectorAll('.glass-card');
    expect(glassCards.length).toBeGreaterThan(0);
  });

  it('renders a visual dashboard Layout indicating multiple sections', () => {
    renderHome();
    expect(screen.getByText('今日待复习')).toBeInTheDocument();
    expect(screen.getByText('已掌握知识')).toBeInTheDocument();
  });
});
