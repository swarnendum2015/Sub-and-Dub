import type { Video, Transcription, Translation, DubbingJob } from '@shared/schema';

export const mockVideo: Video = {
  id: 1,
  filename: 'test-video.mp4',
  originalName: 'Test Video.mp4',
  filePath: '/uploads/test-video.mp4',
  fileSize: 1024000,
  status: 'completed',
  duration: 120,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  bengaliConfirmed: true,
};

export const mockTranscriptions: Transcription[] = [
  {
    id: 1,
    videoId: 1,
    startTime: 0,
    endTime: 5,
    text: 'আমি একটি পরীক্ষার ভিডিও তৈরি করছি।',
    confidence: 0.95,
    model: 'combined',
    createdAt: new Date('2025-01-01T00:01:00Z'),
    speakerId: '1',
    speakerName: 'Speaker 1',
  },
  {
    id: 2,
    videoId: 1,
    startTime: 5,
    endTime: 10,
    text: 'এটি একটি বাংলা থেকে ইংরেজি অনুবাদের উদাহরণ।',
    confidence: 0.92,
    model: 'combined',
    createdAt: new Date('2025-01-01T00:01:30Z'),
    speakerId: '1',
    speakerName: 'Speaker 1',
  },
  {
    id: 3,
    videoId: 1,
    startTime: 10,
    endTime: 15,
    text: 'আমরা এই সিস্টেমটি পরীক্ষা করছি।',
    confidence: 0.88,
    model: 'combined',
    createdAt: new Date('2025-01-01T00:02:00Z'),
    speakerId: '2',
    speakerName: 'Speaker 2',
  },
];

export const mockTranslations: Translation[] = [
  {
    id: 1,
    transcriptionId: 1,
    targetLanguage: 'en',
    text: 'I am creating a test video.',
    confidence: 0.94,
    model: 'gemini-batch',
    createdAt: new Date('2025-01-01T00:02:30Z'),
  },
  {
    id: 2,
    transcriptionId: 2,
    targetLanguage: 'en',
    text: 'This is an example of Bengali to English translation.',
    confidence: 0.91,
    model: 'gemini-batch',
    createdAt: new Date('2025-01-01T00:03:00Z'),
  },
  {
    id: 3,
    transcriptionId: 3,
    targetLanguage: 'en',
    text: 'We are testing this system.',
    confidence: 0.89,
    model: 'gemini-batch',
    createdAt: new Date('2025-01-01T00:03:30Z'),
  },
  {
    id: 4,
    transcriptionId: 1,
    targetLanguage: 'hi',
    text: 'मैं एक परीक्षण वीडियो बना रहा हूं।',
    confidence: 0.93,
    model: 'gemini-batch',
    createdAt: new Date('2025-01-01T00:04:00Z'),
  },
];

export const mockDubbingJobs: DubbingJob[] = [
  {
    id: 1,
    videoId: 1,
    language: 'en',
    status: 'completed',
    audioPath: '/uploads/dubbed-en.mp3',
    jobId: 'elevenlabs-job-123',
    createdAt: new Date('2025-01-01T00:05:00Z'),
  },
  {
    id: 2,
    videoId: 1,
    language: 'hi',
    status: 'processing',
    audioPath: null,
    jobId: 'elevenlabs-job-456',
    createdAt: new Date('2025-01-01T00:06:00Z'),
  },
];

export const createMockVideoFile = (name = 'test-video.mp4', size = 1024000) => {
  const content = new ArrayBuffer(size);
  return new File([content], name, { type: 'video/mp4' });
};

export const mockApiResponses = {
  videos: [mockVideo],
  transcriptions: mockTranscriptions,
  translations: mockTranslations,
  dubbingJobs: mockDubbingJobs,
  uploadResponse: {
    id: 1,
    filename: 'test-video.mp4',
    status: 'processing',
  },
  transcriptionResponse: {
    message: 'Transcription completed',
    segments: mockTranscriptions.length,
  },
  translationResponse: {
    message: 'Translation completed',
    translations: mockTranslations.length,
  },
  dubbingResponse: {
    id: 1,
    status: 'pending',
    message: 'Dubbing job created',
  },
};

export const createTestVideoBlob = () => {
  // Create a minimal MP4-like blob for testing
  const buffer = new ArrayBuffer(1024);
  return new Blob([buffer], { type: 'video/mp4' });
};

export const sampleSRTContent = `1
00:00:00,000 --> 00:00:05,000
I am creating a test video.

2
00:00:05,000 --> 00:00:10,000
This is an example of Bengali to English translation.

3
00:00:10,000 --> 00:00:15,000
We are testing this system.
`;