import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditableTranscriptionPanel } from '@/components/editable-transcription-panel';
import { mockVideo, mockTranscriptions, mockTranslations, mockDubbingJobs } from '../../fixtures/sample-data';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('EditableTranscriptionPanel', () => {
  const mockProps = {
    videoId: '1',
    currentTime: 2.5,
    onTimeSeek: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/transcriptions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTranscriptions),
        });
      }
      if (url.includes('/api/translations')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTranslations),
        });
      }
      if (url.includes('/api/dubbing-jobs')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDubbingJobs),
        });
      }
      if (url.includes('/api/videos/1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockVideo),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });
  });

  it('renders transcription panel with tabs', async () => {
    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Transcription & Translation')).toBeInTheDocument();
      expect(screen.getByText('Bengali')).toBeInTheDocument();
      expect(screen.getByText('English')).toBeInTheDocument();
      expect(screen.getByText('Hindi')).toBeInTheDocument();
    });
  });

  it('displays Bengali confirmed badge when confirmed', async () => {
    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Bengali Confirmed')).toBeInTheDocument();
    });
  });

  it('shows transcriptions with time stamps', async () => {
    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('0:00 - 0:05')).toBeInTheDocument();
      expect(screen.getByText('0:05 - 0:10')).toBeInTheDocument();
      expect(screen.getByText('আমি একটি পরীক্ষার ভিডিও তৈরি করছি।')).toBeInTheDocument();
    });
  });

  it('highlights current segment based on time', async () => {
    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const currentSegment = screen.getByText('আমি একটি পরীক্ষার ভিডিও তৈরি করছি।').closest('[class*="border-primary"]');
      expect(currentSegment).toBeInTheDocument();
    });
  });

  it('allows switching between language tabs', async () => {
    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const englishTab = screen.getByText('English');
      fireEvent.click(englishTab);
    });

    await waitFor(() => {
      expect(screen.getByText('I am creating a test video.')).toBeInTheDocument();
    });
  });

  it('shows translation completion status in tabs', async () => {
    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      // English tab should show completed status (checkmark)
      const englishTab = screen.getByText('English').closest('button');
      expect(englishTab?.querySelector('svg')).toBeInTheDocument();
    });
  });

  it('allows editing transcription text', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 1, text: 'Updated text' }),
      })
    );

    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const transcriptionCard = screen.getByText('আমি একটি পরীক্ষার ভিডিও তৈরি করছি।').closest('[class*="group"]');
      fireEvent.mouseEnter(transcriptionCard!);
    });

    await waitFor(() => {
      const editButton = screen.getByTitle('Edit text');
      fireEvent.click(editButton);
    });

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Updated Bengali text' } });

    const saveButton = screen.getByRole('button', { name: /check/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/transcriptions/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ text: 'Updated Bengali text' }),
        })
      );
    });
  });

  it('allows editing translation text', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 1, text: 'Updated translation' }),
      })
    );

    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    // Switch to English tab
    await waitFor(() => {
      const englishTab = screen.getByText('English');
      fireEvent.click(englishTab);
    });

    await waitFor(() => {
      const translationCard = screen.getByText('I am creating a test video.').closest('[class*="group"]');
      fireEvent.mouseEnter(translationCard!);
    });

    await waitFor(() => {
      const editButton = screen.getByTitle('Edit text');
      fireEvent.click(editButton);
    });

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Updated English translation' } });

    const saveButton = screen.getByRole('button', { name: /check/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/translations/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ text: 'Updated English translation' }),
        })
      );
    });
  });

  it('triggers translation for incomplete languages', async () => {
    // Mock incomplete translation state
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/translations')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]), // No translations
        });
      }
      return mockFetch.getMockImplementation()?.(url) || Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    // Switch to Tamil tab (should be incomplete)
    await waitFor(() => {
      const tamilTab = screen.getByText('Tamil');
      fireEvent.click(tamilTab);
    });

    await waitFor(() => {
      const translateButton = screen.getByText(/Generate Tamil Translation/);
      fireEvent.click(translateButton);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/videos/1/translate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ targetLanguage: 'ta' }),
        })
      );
    });
  });

  it('shows dubbing section when not on Bengali tab', async () => {
    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    // Switch to English tab
    await waitFor(() => {
      const englishTab = screen.getByText('English');
      fireEvent.click(englishTab);
    });

    await waitFor(() => {
      expect(screen.getByText('Audio Dubbing - English')).toBeInTheDocument();
      expect(screen.getByText('Uses Original Video Audio')).toBeInTheDocument();
    });
  });

  it('allows speaker count selection for dubbing', async () => {
    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    // Switch to English tab
    await waitFor(() => {
      const englishTab = screen.getByText('English');
      fireEvent.click(englishTab);
    });

    await waitFor(() => {
      const speakerSelect = screen.getByDisplayValue('1 Speaker');
      fireEvent.click(speakerSelect);
    });

    await waitFor(() => {
      const twoSpeakerOption = screen.getByText('2 Speakers');
      fireEvent.click(twoSpeakerOption);
    });

    await waitFor(() => {
      expect(screen.getByText('Voice 1:')).toBeInTheDocument();
      expect(screen.getByText('Voice 2:')).toBeInTheDocument();
    });
  });

  it('triggers dubbing job creation', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 1, status: 'pending' }),
      })
    );

    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    // Switch to English tab
    await waitFor(() => {
      const englishTab = screen.getByText('English');
      fireEvent.click(englishTab);
    });

    await waitFor(() => {
      const dubbingButton = screen.getByText(/Generate Audio Dubbing/);
      fireEvent.click(dubbingButton);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/videos/1/dubbing',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            language: 'en',
            voiceIds: ['21m00Tcm4TlvDq8ikWAM'],
            speakerCount: 1
          }),
        })
      );
    });
  });

  it('shows confidence scores for transcriptions and translations', async () => {
    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('95%')).toBeInTheDocument(); // Confidence score
    });
  });

  it('shows speaker identification badges', async () => {
    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Speaker 1')).toBeInTheDocument();
      expect(screen.getByText('Speaker 2')).toBeInTheDocument();
    });
  });

  it('allows seeking to specific time when clicking on transcription', async () => {
    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const transcriptionCard = screen.getByText('আমি একটি পরীক্ষার ভিডিও তৈরি করছি।').closest('[class*="cursor-pointer"]');
      fireEvent.click(transcriptionCard!);
    });

    expect(mockProps.onTimeSeek).toHaveBeenCalledWith(0); // Start time of first transcription
  });

  it('handles re-translation of specific segments', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ message: 'Translation refreshed' }),
      })
    );

    render(<EditableTranscriptionPanel {...mockProps} />, {
      wrapper: createWrapper(),
    });

    // Switch to English tab
    await waitFor(() => {
      const englishTab = screen.getByText('English');
      fireEvent.click(englishTab);
    });

    await waitFor(() => {
      const translationCard = screen.getByText('I am creating a test video.').closest('[class*="group"]');
      fireEvent.mouseEnter(translationCard!);
    });

    await waitFor(() => {
      const retranslateButton = screen.getByTitle('Re-verify translation');
      fireEvent.click(retranslateButton);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/transcriptions/1/retranslate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ targetLanguage: 'en' }),
        })
      );
    });
  });
});