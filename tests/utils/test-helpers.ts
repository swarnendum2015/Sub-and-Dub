import { vi } from 'vitest';
import type { MockedFunction } from 'vitest';

export function createMockFetch() {
  const mockFetch = vi.fn() as MockedFunction<typeof fetch>;
  
  // Default success responses
  mockFetch.mockImplementation((url: string) => {
    console.log('Mock fetch called with:', url);
    
    if (url.includes('/api/videos') && !url.includes('/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    }
    
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
  });
  
  return mockFetch;
}

export function mockApiResponse(url: string, response: any) {
  const mockFetch = global.fetch as MockedFunction<typeof fetch>;
  
  mockFetch.mockImplementationOnce((requestUrl: string) => {
    if (requestUrl.includes(url)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(response),
      } as Response);
    }
    
    return mockFetch.getMockImplementation()?.(requestUrl) || 
           Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
}

export function mockApiError(url: string, error: { status: number; message: string }) {
  const mockFetch = global.fetch as MockedFunction<typeof fetch>;
  
  mockFetch.mockImplementationOnce((requestUrl: string) => {
    if (requestUrl.includes(url)) {
      return Promise.resolve({
        ok: false,
        status: error.status,
        json: () => Promise.resolve({ error: error.message }),
      } as Response);
    }
    
    return mockFetch.getMockImplementation()?.(requestUrl) || 
           Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
}

export function waitForApiCall(url: string, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const mockFetch = global.fetch as MockedFunction<typeof fetch>;
    const originalImplementation = mockFetch.getMockImplementation();
    
    const timeoutId = setTimeout(() => {
      mockFetch.mockImplementation(originalImplementation!);
      resolve(false);
    }, timeout);
    
    mockFetch.mockImplementation((requestUrl: string, options?: any) => {
      if (requestUrl.includes(url)) {
        clearTimeout(timeoutId);
        mockFetch.mockImplementation(originalImplementation!);
        resolve(true);
      }
      
      return originalImplementation?.(requestUrl, options) || 
             Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
  });
}

export function createTestVideo(overrides = {}) {
  return {
    id: 1,
    filename: 'test-video.mp4',
    originalName: 'Test Video.mp4',
    filePath: '/uploads/test-video.mp4',
    fileSize: 1024000,
    status: 'completed',
    duration: 120,
    createdAt: new Date(),
    bengaliConfirmed: true,
    ...overrides,
  };
}

export function createTestTranscription(overrides = {}) {
  return {
    id: 1,
    videoId: 1,
    startTime: 0,
    endTime: 5,
    text: 'Test transcription text',
    confidence: 0.95,
    model: 'combined',
    createdAt: new Date(),
    speakerId: '1',
    speakerName: 'Speaker 1',
    ...overrides,
  };
}

export function createTestTranslation(overrides = {}) {
  return {
    id: 1,
    transcriptionId: 1,
    targetLanguage: 'en',
    text: 'Test translation text',
    confidence: 0.94,
    model: 'gemini-batch',
    createdAt: new Date(),
    ...overrides,
  };
}

export function createTestDubbingJob(overrides = {}) {
  return {
    id: 1,
    videoId: 1,
    language: 'en',
    status: 'completed',
    audioPath: '/uploads/dubbed-en.mp3',
    jobId: 'test-job-123',
    createdAt: new Date(),
    ...overrides,
  };
}

export function setupQueryClientMocks() {
  const mockInvalidateQueries = vi.fn();
  const mockQueryClient = {
    invalidateQueries: mockInvalidateQueries,
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  };
  
  return { mockQueryClient, mockInvalidateQueries };
}

export function createMockFile(name: string, type: string, size: number = 1024) {
  const content = new ArrayBuffer(size);
  return new File([content], name, { type });
}

export function simulateFileUpload(input: HTMLElement, file: File) {
  const event = new Event('change', { bubbles: true });
  Object.defineProperty(event, 'target', {
    writable: false,
    value: { files: [file] },
  });
  
  input.dispatchEvent(event);
}

export function expectApiCall(url: string, method: string = 'GET', body?: any) {
  const mockFetch = global.fetch as MockedFunction<typeof fetch>;
  
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining(url),
    expect.objectContaining({
      method,
      ...(body && {
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(body),
      }),
    })
  );
}

export function getLastApiCall() {
  const mockFetch = global.fetch as MockedFunction<typeof fetch>;
  const calls = mockFetch.mock.calls;
  return calls[calls.length - 1];
}

export function clearApiCallHistory() {
  const mockFetch = global.fetch as MockedFunction<typeof fetch>;
  mockFetch.mockClear();
}

// Performance testing helpers
export function measureRenderTime<T>(renderFn: () => T): { result: T; time: number } {
  const start = performance.now();
  const result = renderFn();
  const end = performance.now();
  
  return {
    result,
    time: end - start,
  };
}

export function waitForCondition(
  condition: () => boolean,
  timeout: number = 5000,
  interval: number = 100
): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const check = () => {
      if (condition()) {
        resolve(true);
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        resolve(false);
        return;
      }
      
      setTimeout(check, interval);
    };
    
    check();
  });
}

// Validation helpers
export function validateSRTFormat(content: string): boolean {
  if (!content || typeof content !== 'string') return false;
  
  const lines = content.split('\n');
  let sequenceNumber = 1;
  let i = 0;
  
  while (i < lines.length) {
    // Skip empty lines at the beginning
    while (i < lines.length && lines[i].trim() === '') {
      i++;
    }
    
    if (i >= lines.length) break;
    
    // Check sequence number
    if (lines[i].trim() !== sequenceNumber.toString()) {
      return false;
    }
    i++;
    
    // Check timestamp format
    if (i >= lines.length) return false;
    if (!/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/.test(lines[i])) {
      return false;
    }
    i++;
    
    // Check subtitle text (at least one line)
    if (i >= lines.length) return false;
    let hasText = false;
    while (i < lines.length && lines[i].trim() !== '') {
      hasText = true;
      i++;
    }
    
    if (!hasText) return false;
    
    sequenceNumber++;
  }
  
  return sequenceNumber > 1; // At least one subtitle entry
}

export function validateTimestamp(timestamp: string): boolean {
  return /\d{2}:\d{2}:\d{2},\d{3}/.test(timestamp);
}

export function parseTimestamp(timestamp: string): number {
  const [time, ms] = timestamp.split(',');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  
  return (hours * 3600 + minutes * 60 + seconds) * 1000 + Number(ms);
}