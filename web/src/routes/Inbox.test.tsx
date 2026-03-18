import { render, screen, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MantineProvider } from '@mantine/core';
import Inbox from './Inbox';

vi.mock('../services/api', () => ({
  api: {
    getCards: vi.fn().mockResolvedValue({
      cards: [
        { id: '1', title: 'React Hooks', category: 'Programming', brief: 'Hooks are functions...', created_at: new Date().toISOString() },
        { id: '2', title: 'Vitest Basics', category: 'Testing', brief: 'Vitest is great...', created_at: new Date().toISOString() },
      ],
    }),
  },
}));

describe('Inbox Redesign', () => {
  const renderInbox = async () => {
    let result: any;
    await act(async () => {
      result = render(
        <MantineProvider>
          <BrowserRouter>
            <Inbox />
          </BrowserRouter>
        </MantineProvider>
      );
    });
    return result;
  };

  it('renders the spotlight search input', async () => {
    const { container } = await renderInbox();
    expect(container.querySelector('.spotlight-search')).toBeInTheDocument();
  });

  it('renders filter tags using glassmorphism pills', async () => {
    const { container } = await renderInbox();
    expect(container.querySelectorAll('.glass-filter-btn').length).toBeGreaterThan(0);
  });

  it('renders cards using masonry grid and glass-card styling', async () => {
    const { container } = await renderInbox();
    // Verify the grid container exists
    expect(container.querySelector('.masonry-grid')).toBeInTheDocument();
    
    // Check if the loaded cards have glass-card class
    const cards = container.querySelectorAll('.glass-card');
    expect(cards.length).toBeGreaterThan(0);
  });
});
