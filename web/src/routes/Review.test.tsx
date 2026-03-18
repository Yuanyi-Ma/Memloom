import { render, screen, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect } from 'vitest';
import { MantineProvider } from '@mantine/core';
import Review from './Review';

vi.mock('../hooks/useReview', () => ({
  useReview: () => ({
    queue: ['1'],
    currentIndex: 0,
    currentCard: { id: '1', feynman_seed: 'What is Quantum Entanglement?', detail: 'A phenomenon...' },
    viewState: 'question',
    sessionStats: { correct: 0, hard: 0, wrong: 0 },
    startSession: vi.fn().mockResolvedValue(true),
    rateAndLoadNext: vi.fn(),
    setViewState: vi.fn(),
  }),
}));

// Mock the zustand store simply for test
vi.mock('../stores/reviewStore', () => ({
  useReviewStore: {
    getState: () => ({
      queue: ['1'],
      setViewState: vi.fn(),
    }),
  },
}));

describe('Review Page Redesign', () => {
  const renderReview = async () => {
    let result: any;
    await act(async () => {
      result = render(
        <MantineProvider>
          <BrowserRouter>
            <Review />
          </BrowserRouter>
        </MantineProvider>
      );
    });
    return result;
  };

  it('renders a deep spatial background wrapper', async () => {
    const { container } = await renderReview();
    expect(container.querySelector('.review-aura-container')).toBeInTheDocument();
  });

  it('renders the question text inside a 3D flashcard', async () => {
    const { container } = await renderReview();
    expect(screen.getByText('What is Quantum Entanglement?')).toBeInTheDocument();
    
    // Specifically verify the flashcard 3D class is present
    const flashcard = container.querySelector('.flashcard-3d');
    expect(flashcard).toBeInTheDocument();
  });

  it('renders minimalist feedback buttons with glowing logic', async () => {
    const { container } = await renderReview();
    
    // In question state, the footer should have the buttons, but in our redesign, 
    // we want them to use sleek minimal components.
    const feedbackBtns = container.querySelectorAll('.feedback-btn-minimal');
    expect(feedbackBtns.length).toBeGreaterThan(0);
  });
});
