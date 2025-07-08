import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Landing } from '@/pages/landing';
import { createMockVideoFile } from '../../fixtures/sample-data';

// Mock react-router
vi.mock('wouter', () => ({
  useLocation: () => ['/'],
  useNavigate: () => vi.fn(),
}));

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

describe('Landing Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    );
  });

  it('renders upload interface', async () => {
    render(<Landing />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Video Dubbing & Translation/)).toBeInTheDocument();
      expect(screen.getByText(/Upload Video/)).toBeInTheDocument();
    });
  });

  it('shows upload tabs for different methods', async () => {
    render(<Landing />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('File Upload')).toBeInTheDocument();
      expect(screen.getByText('S3 Bucket')).toBeInTheDocument();
      expect(screen.getByText('YouTube URL')).toBeInTheDocument();
    });
  });

  it('handles file upload', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 1,
          filename: 'test-video.mp4',
          status: 'uploaded'
        }),
      })
    );

    render(<Landing />, { wrapper: createWrapper() });

    const fileInput = screen.getByLabelText(/drag.*drop.*files/i);
    const mockFile = createMockVideoFile();

    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    await waitFor(() => {
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });
  });

  it('validates file size limits', async () => {
    render(<Landing />, { wrapper: createWrapper() });

    const fileInput = screen.getByLabelText(/drag.*drop.*files/i);
    const largeFile = createMockVideoFile('large-video.mp4', 600 * 1024 * 1024); // 600MB

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(screen.getByText(/file too large/i)).toBeInTheDocument();
    });
  });

  it('validates file types', async () => {
    render(<Landing />, { wrapper: createWrapper() });

    const fileInput = screen.getByLabelText(/drag.*drop.*files/i);
    const invalidFile = new File(['content'], 'document.pdf', { type: 'application/pdf' });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(screen.getByText(/invalid file type/i)).toBeInTheDocument();
    });
  });

  it('handles S3 bucket upload', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 1,
          filename: 's3-video.mp4',
          status: 'processing'
        }),
      })
    );

    render(<Landing />, { wrapper: createWrapper() });

    // Switch to S3 tab
    const s3Tab = screen.getByText('S3 Bucket');
    fireEvent.click(s3Tab);

    await waitFor(() => {
      const urlInput = screen.getByPlaceholder(/S3 bucket URL/i);
      fireEvent.change(urlInput, { 
        target: { value: 'https://bucket.s3.amazonaws.com/video.mp4' }
      });

      const uploadButton = screen.getByText(/Upload from S3/i);
      fireEvent.click(uploadButton);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/upload/s3',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            s3Url: 'https://bucket.s3.amazonaws.com/video.mp4'
          }),
        })
      );
    });
  });

  it('handles YouTube URL upload', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 1,
          filename: 'youtube-video.mp4',
          status: 'processing'
        }),
      })
    );

    render(<Landing />, { wrapper: createWrapper() });

    // Switch to YouTube tab
    const youtubeTab = screen.getByText('YouTube URL');
    fireEvent.click(youtubeTab);

    await waitFor(() => {
      const urlInput = screen.getByPlaceholder(/YouTube video URL/i);
      fireEvent.change(urlInput, { 
        target: { value: 'https://www.youtube.com/watch?v=test123' }
      });

      const uploadButton = screen.getByText(/Upload from YouTube/i);
      fireEvent.click(uploadButton);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/upload/youtube',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            youtubeUrl: 'https://www.youtube.com/watch?v=test123'
          }),
        })
      );
    });
  });

  it('validates YouTube URL format', async () => {
    render(<Landing />, { wrapper: createWrapper() });

    const youtubeTab = screen.getByText('YouTube URL');
    fireEvent.click(youtubeTab);

    await waitFor(() => {
      const urlInput = screen.getByPlaceholder(/YouTube video URL/i);
      fireEvent.change(urlInput, { 
        target: { value: 'invalid-url' }
      });

      const uploadButton = screen.getByText(/Upload from YouTube/i);
      fireEvent.click(uploadButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/invalid YouTube URL/i)).toBeInTheDocument();
    });
  });

  it('shows upload progress and status', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 1,
          filename: 'test-video.mp4',
          status: 'processing'
        }),
      })
    );

    render(<Landing />, { wrapper: createWrapper() });

    const fileInput = screen.getByLabelText(/drag.*drop.*files/i);
    const mockFile = createMockVideoFile();

    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    await waitFor(() => {
      expect(screen.getByText(/uploading/i)).toBeInTheDocument();
    });
  });

  it('displays recent videos', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/videos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 1,
              filename: 'recent-video.mp4',
              originalName: 'Recent Video.mp4',
              status: 'completed',
              createdAt: new Date().toISOString(),
            }
          ]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<Landing />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Recent Videos')).toBeInTheDocument();
      expect(screen.getByText('Recent Video.mp4')).toBeInTheDocument();
    });
  });

  it('shows model selection for transcription', async () => {
    render(<Landing />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Transcription Models/i)).toBeInTheDocument();
      expect(screen.getByText(/OpenAI Whisper/i)).toBeInTheDocument();
      expect(screen.getByText(/Gemini 2.5 Pro/i)).toBeInTheDocument();
      expect(screen.getByText(/ElevenLabs STT/i)).toBeInTheDocument();
    });
  });

  it('allows multiple model selection', async () => {
    render(<Landing />, { wrapper: createWrapper() });

    await waitFor(() => {
      const openaiCheckbox = screen.getByLabelText(/OpenAI Whisper/i);
      const geminiCheckbox = screen.getByLabelText(/Gemini 2.5 Pro/i);

      fireEvent.click(openaiCheckbox);
      fireEvent.click(geminiCheckbox);

      expect(openaiCheckbox).toBeChecked();
      expect(geminiCheckbox).toBeChecked();
    });
  });

  it('navigates to workspace after successful upload', async () => {
    const mockNavigate = vi.fn();
    vi.mocked(require('wouter').useNavigate).mockReturnValue(mockNavigate);

    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 1,
          filename: 'test-video.mp4',
          status: 'uploaded'
        }),
      })
    );

    render(<Landing />, { wrapper: createWrapper() });

    const fileInput = screen.getByLabelText(/drag.*drop.*files/i);
    const mockFile = createMockVideoFile();

    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/workspace/1');
    });
  });

  it('handles upload errors gracefully', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Upload failed' }),
      })
    );

    render(<Landing />, { wrapper: createWrapper() });

    const fileInput = screen.getByLabelText(/drag.*drop.*files/i);
    const mockFile = createMockVideoFile();

    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    await waitFor(() => {
      expect(screen.getByText(/upload failed/i)).toBeInTheDocument();
    });
  });

  it('shows feature highlights', async () => {
    render(<Landing />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Multi-Model Transcription/i)).toBeInTheDocument();
      expect(screen.getByText(/ElevenLabs Dubbing Studio/i)).toBeInTheDocument();
      expect(screen.getByText(/Batch Translation/i)).toBeInTheDocument();
      expect(screen.getByText(/SRT Export/i)).toBeInTheDocument();
    });
  });
});