import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createTestApp } from './test-app';
import { mockVideo, mockTranscriptions, mockTranslations, createTestVideoBlob } from '../fixtures/sample-data';

describe('API Endpoints', () => {
  let app: Express;
  let server: any;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.listen(0); // Use random port for testing
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe('Video API', () => {
    it('should get all videos', async () => {
      const response = await request(app)
        .get('/api/videos')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should upload a video file', async () => {
      const videoBuffer = Buffer.from('fake video content');
      
      const response = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'test-video.mp4')
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('filename');
      expect(response.body.filename).toContain('.mp4');
    });

    it('should reject invalid video formats', async () => {
      const textBuffer = Buffer.from('not a video');
      
      await request(app)
        .post('/api/upload')
        .attach('video', textBuffer, 'test.txt')
        .expect(400);
    });

    it('should get video by ID', async () => {
      // First upload a video
      const videoBuffer = Buffer.from('fake video content');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'test-video.mp4')
        .expect(200);

      const videoId = uploadResponse.body.id;

      // Then get it by ID
      const response = await request(app)
        .get(`/api/videos/${videoId}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', videoId);
      expect(response.body).toHaveProperty('filename');
    });

    it('should confirm Bengali transcription', async () => {
      // Upload and get video ID
      const videoBuffer = Buffer.from('fake video content');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'test-video.mp4');
      
      const videoId = uploadResponse.body.id;

      const response = await request(app)
        .post(`/api/videos/${videoId}/confirm-transcription`)
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Transcription API', () => {
    let videoId: number;

    beforeEach(async () => {
      // Upload a test video for each test
      const videoBuffer = Buffer.from('fake video content');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'test-video.mp4');
      videoId = uploadResponse.body.id;
    });

    it('should get transcriptions for a video', async () => {
      const response = await request(app)
        .get(`/api/transcriptions?videoId=${videoId}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should update transcription text', async () => {
      // First, create a transcription by processing the video
      await request(app)
        .post(`/api/videos/${videoId}/process`)
        .send({ selectedModels: ['openai'] });

      // Get transcriptions
      const transcriptionsResponse = await request(app)
        .get(`/api/transcriptions?videoId=${videoId}`);

      if (transcriptionsResponse.body.length > 0) {
        const transcriptionId = transcriptionsResponse.body[0].id;
        const newText = 'Updated transcription text';

        const response = await request(app)
          .patch(`/api/transcriptions/${transcriptionId}`)
          .send({ text: newText })
          .expect(200);

        expect(response.body).toHaveProperty('text', newText);
      }
    });
  });

  describe('Translation API', () => {
    let videoId: number;

    beforeEach(async () => {
      const videoBuffer = Buffer.from('fake video content');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'test-video.mp4');
      videoId = uploadResponse.body.id;
    });

    it('should start batch translation', async () => {
      // First confirm Bengali transcription
      await request(app)
        .post(`/api/videos/${videoId}/confirm-transcription`);

      const response = await request(app)
        .post(`/api/videos/${videoId}/translate`)
        .send({ targetLanguage: 'en' })
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });

    it('should get translations for a video', async () => {
      const response = await request(app)
        .get(`/api/translations?videoId=${videoId}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should update translation text', async () => {
      // Create and translate first
      await request(app)
        .post(`/api/videos/${videoId}/confirm-transcription`);
      
      await request(app)
        .post(`/api/videos/${videoId}/translate`)
        .send({ targetLanguage: 'en' });

      const translationsResponse = await request(app)
        .get(`/api/translations?videoId=${videoId}`);

      if (translationsResponse.body.length > 0) {
        const translationId = translationsResponse.body[0].id;
        const newText = 'Updated translation text';

        const response = await request(app)
          .patch(`/api/translations/${translationId}`)
          .send({ text: newText })
          .expect(200);

        expect(response.body).toHaveProperty('text', newText);
      }
    });
  });

  describe('Dubbing API', () => {
    let videoId: number;

    beforeEach(async () => {
      const videoBuffer = Buffer.from('fake video content');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'test-video.mp4');
      videoId = uploadResponse.body.id;
    });

    it('should create dubbing job', async () => {
      const response = await request(app)
        .post(`/api/videos/${videoId}/dubbing`)
        .send({
          language: 'en',
          voiceIds: ['21m00Tcm4TlvDq8ikWAM'],
          dubbingType: 'studio'
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('status');
    });

    it('should get dubbing jobs for a video', async () => {
      const response = await request(app)
        .get(`/api/dubbing-jobs?videoId=${videoId}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('SRT Export API', () => {
    let videoId: number;

    beforeEach(async () => {
      const videoBuffer = Buffer.from('fake video content');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'test-video.mp4');
      videoId = uploadResponse.body.id;
    });

    it('should generate SRT file', async () => {
      const response = await request(app)
        .get(`/api/videos/${videoId}/srt?language=en`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.headers['content-disposition']).toContain('attachment');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent video ID', async () => {
      await request(app)
        .get('/api/videos/99999')
        .expect(404);
    });

    it('should handle invalid translation language', async () => {
      const videoBuffer = Buffer.from('fake video content');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'test-video.mp4');
      
      const videoId = uploadResponse.body.id;

      await request(app)
        .post(`/api/videos/${videoId}/translate`)
        .send({ targetLanguage: 'invalid' })
        .expect(400);
    });

    it('should handle file size limits', async () => {
      const largeBuffer = Buffer.alloc(600 * 1024 * 1024); // 600MB - exceeds 500MB limit
      
      await request(app)
        .post('/api/upload')
        .attach('video', largeBuffer, 'large-video.mp4')
        .expect(413);
    });
  });
});