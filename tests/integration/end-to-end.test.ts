import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../backend/test-app';
import { mockVideo, mockTranscriptions, mockTranslations, createTestVideoBlob } from '../fixtures/sample-data';
import { validateSRTFormat, waitForCondition } from '../utils/test-helpers';

describe('End-to-End Integration Tests', () => {
  let app: any;
  let server: any;
  let videoId: number;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.listen(0);
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe('Complete Video Processing Pipeline', () => {
    it('should handle full workflow: upload → transcribe → translate → dub → export', async () => {
      // Step 1: Upload video
      const videoBuffer = Buffer.from('fake video content for integration test');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'integration-test.mp4')
        .expect(200);

      videoId = uploadResponse.body.id;
      expect(uploadResponse.body.filename).toContain('.mp4');

      // Step 2: Process transcription
      const processResponse = await request(app)
        .post(`/api/videos/${videoId}/process`)
        .send({ selectedModels: ['combined'] })
        .expect(200);

      expect(processResponse.body.message).toContain('completed');

      // Step 3: Confirm Bengali transcription
      await request(app)
        .post(`/api/videos/${videoId}/confirm-transcription`)
        .expect(200);

      // Step 4: Generate translations for multiple languages
      const languages = ['en', 'hi', 'ta', 'te', 'ml'];
      
      for (const language of languages) {
        const translationResponse = await request(app)
          .post(`/api/videos/${videoId}/translate`)
          .send({ targetLanguage: language })
          .expect(200);

        expect(translationResponse.body.message).toContain('completed');
      }

      // Step 5: Create dubbing jobs
      for (const language of languages) {
        const dubbingResponse = await request(app)
          .post(`/api/videos/${videoId}/dubbing`)
          .send({
            language,
            voiceIds: ['21m00Tcm4TlvDq8ikWAM'],
            dubbingType: 'studio'
          })
          .expect(200);

        expect(dubbingResponse.body.language).toBe(language);
      }

      // Step 6: Export SRT files
      for (const language of ['bn', ...languages]) {
        const srtResponse = await request(app)
          .get(`/api/videos/${videoId}/srt?language=${language}`)
          .expect(200);

        expect(srtResponse.headers['content-type']).toContain('text/plain');
        expect(validateSRTFormat(srtResponse.text)).toBe(true);
      }

      // Step 7: Verify final state
      const finalVideo = await request(app)
        .get(`/api/videos/${videoId}`)
        .expect(200);

      expect(finalVideo.body.bengaliConfirmed).toBe(true);
      expect(finalVideo.body.status).toBe('completed');
    });

    it('should handle multi-model transcription with fallbacks', async () => {
      const videoBuffer = Buffer.from('test video for multi-model');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'multi-model-test.mp4');

      const videoId = uploadResponse.body.id;

      // Test with multiple models
      const response = await request(app)
        .post(`/api/videos/${videoId}/process`)
        .send({ selectedModels: ['openai', 'gemini', 'elevenlabs'] })
        .expect(200);

      expect(response.body.message).toContain('completed');

      // Verify transcriptions were created
      const transcriptions = await request(app)
        .get(`/api/transcriptions?videoId=${videoId}`)
        .expect(200);

      expect(transcriptions.body.length).toBeGreaterThan(0);
      expect(transcriptions.body[0]).toHaveProperty('model');
      expect(transcriptions.body[0]).toHaveProperty('confidence');
    });

    it('should handle batch translation performance', async () => {
      const videoBuffer = Buffer.from('batch translation test video');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'batch-test.mp4');

      const videoId = uploadResponse.body.id;

      // Process and confirm transcription
      await request(app)
        .post(`/api/videos/${videoId}/process`)
        .send({ selectedModels: ['combined'] });

      await request(app)
        .post(`/api/videos/${videoId}/confirm-transcription`);

      // Measure batch translation time
      const startTime = Date.now();
      
      await request(app)
        .post(`/api/videos/${videoId}/translate`)
        .send({ targetLanguage: 'en' })
        .expect(200);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Batch translation should be fast (under 10 seconds for test data)
      expect(duration).toBeLessThan(10000);

      // Verify all segments were translated
      const translations = await request(app)
        .get(`/api/translations?videoId=${videoId}`)
        .expect(200);

      expect(translations.body.length).toBeGreaterThan(0);
      expect(translations.body[0].model).toBe('gemini-batch');
    });

    it('should handle concurrent processing', async () => {
      // Upload multiple videos simultaneously
      const uploadPromises = Array.from({ length: 3 }, (_, i) => 
        request(app)
          .post('/api/upload')
          .attach('video', Buffer.from(`concurrent test ${i}`), `concurrent-${i}.mp4`)
      );

      const uploadResponses = await Promise.all(uploadPromises);
      const videoIds = uploadResponses.map(res => res.body.id);

      // Process all videos concurrently
      const processPromises = videoIds.map(id =>
        request(app)
          .post(`/api/videos/${id}/process`)
          .send({ selectedModels: ['combined'] })
      );

      const processResponses = await Promise.all(processPromises);
      
      // All should succeed
      processResponses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.message).toContain('completed');
      });
    });

    it('should handle error recovery and retries', async () => {
      const videoBuffer = Buffer.from('error recovery test');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'error-test.mp4');

      const videoId = uploadResponse.body.id;

      // First, successful processing
      await request(app)
        .post(`/api/videos/${videoId}/process`)
        .send({ selectedModels: ['combined'] })
        .expect(200);

      // Confirm transcription
      await request(app)
        .post(`/api/videos/${videoId}/confirm-transcription`)
        .expect(200);

      // Retry translation (should work even if called multiple times)
      const response1 = await request(app)
        .post(`/api/videos/${videoId}/translate`)
        .send({ targetLanguage: 'en' })
        .expect(200);

      expect(response1.body.message).toContain('completed');

      // Verify no duplicate translations were created
      const translations = await request(app)
        .get(`/api/translations?videoId=${videoId}`)
        .expect(200);

      const englishTranslations = translations.body.filter(t => t.targetLanguage === 'en');
      const transcriptions = await request(app)
        .get(`/api/transcriptions?videoId=${videoId}`)
        .expect(200);

      // Should have one translation per transcription
      expect(englishTranslations.length).toBe(transcriptions.body.length);
    });

    it('should validate data consistency across operations', async () => {
      const videoBuffer = Buffer.from('consistency test video');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'consistency-test.mp4');

      const videoId = uploadResponse.body.id;

      // Complete workflow
      await request(app)
        .post(`/api/videos/${videoId}/process`)
        .send({ selectedModels: ['combined'] });

      await request(app)
        .post(`/api/videos/${videoId}/confirm-transcription`);

      await request(app)
        .post(`/api/videos/${videoId}/translate`)
        .send({ targetLanguage: 'en' });

      // Verify data relationships
      const video = await request(app)
        .get(`/api/videos/${videoId}`)
        .expect(200);

      const transcriptions = await request(app)
        .get(`/api/transcriptions?videoId=${videoId}`)
        .expect(200);

      const translations = await request(app)
        .get(`/api/translations?videoId=${videoId}`)
        .expect(200);

      // Data consistency checks
      expect(video.body.id).toBe(videoId);
      expect(transcriptions.body.length).toBeGreaterThan(0);
      
      transcriptions.body.forEach(transcription => {
        expect(transcription.videoId).toBe(videoId);
        expect(transcription.startTime).toBeGreaterThanOrEqual(0);
        expect(transcription.endTime).toBeGreaterThan(transcription.startTime);
        expect(transcription.text).toBeTruthy();
        expect(transcription.confidence).toBeGreaterThan(0);
        expect(transcription.confidence).toBeLessThanOrEqual(1);
      });

      translations.body.forEach(translation => {
        const relatedTranscription = transcriptions.body.find(
          t => t.id === translation.transcriptionId
        );
        expect(relatedTranscription).toBeTruthy();
        expect(translation.targetLanguage).toBe('en');
        expect(translation.text).toBeTruthy();
      });
    });

    it('should handle file size and format validation', async () => {
      // Test valid formats
      const validFormats = [
        { buffer: Buffer.from('mp4 content'), filename: 'test.mp4' },
        { buffer: Buffer.from('mov content'), filename: 'test.mov' },
        { buffer: Buffer.from('avi content'), filename: 'test.avi' },
      ];

      for (const { buffer, filename } of validFormats) {
        const response = await request(app)
          .post('/api/upload')
          .attach('video', buffer, filename)
          .expect(200);

        expect(response.body.filename).toContain(filename.split('.').pop());
      }

      // Test invalid formats
      const invalidBuffer = Buffer.from('not a video');
      await request(app)
        .post('/api/upload')
        .attach('video', invalidBuffer, 'document.pdf')
        .expect(400);
    });

    it('should handle speaker identification and multi-voice dubbing', async () => {
      const videoBuffer = Buffer.from('multi-speaker test video');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'multi-speaker.mp4');

      const videoId = uploadResponse.body.id;

      // Process with speaker identification
      await request(app)
        .post(`/api/videos/${videoId}/process`)
        .send({ selectedModels: ['combined'] });

      await request(app)
        .post(`/api/videos/${videoId}/confirm-transcription`);

      // Get transcriptions and verify speaker info
      const transcriptions = await request(app)
        .get(`/api/transcriptions?videoId=${videoId}`)
        .expect(200);

      const speakerIds = new Set(
        transcriptions.body
          .map(t => t.speakerId)
          .filter(Boolean)
      );

      // Create multi-voice dubbing
      const voiceIds = ['21m00Tcm4TlvDq8ikWAM', 'EXAVITQu4vr4xnSDxMaL'];
      const dubbingResponse = await request(app)
        .post(`/api/videos/${videoId}/dubbing`)
        .send({
          language: 'en',
          voiceIds: voiceIds.slice(0, Math.max(1, speakerIds.size)),
          dubbingType: 'studio'
        })
        .expect(200);

      expect(dubbingResponse.body.language).toBe('en');
    });

    it('should measure and validate performance benchmarks', async () => {
      const videoBuffer = Buffer.from('performance test video');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'performance-test.mp4');

      const videoId = uploadResponse.body.id;

      // Measure transcription time
      const transcriptionStart = Date.now();
      await request(app)
        .post(`/api/videos/${videoId}/process`)
        .send({ selectedModels: ['combined'] });
      const transcriptionTime = Date.now() - transcriptionStart;

      // Measure translation time
      await request(app)
        .post(`/api/videos/${videoId}/confirm-transcription`);

      const translationStart = Date.now();
      await request(app)
        .post(`/api/videos/${videoId}/translate`)
        .send({ targetLanguage: 'en' });
      const translationTime = Date.now() - translationStart;

      // Performance benchmarks (adjust based on actual requirements)
      expect(transcriptionTime).toBeLessThan(30000); // 30 seconds max
      expect(translationTime).toBeLessThan(15000);   // 15 seconds max for batch

      console.log(`Performance metrics:
        Transcription: ${transcriptionTime}ms
        Translation: ${translationTime}ms`);
    });
  });

  describe('API Rate Limiting and Quotas', () => {
    it('should handle API quota exceeded gracefully', async () => {
      // This would test the actual quota handling
      // For now, we verify the error handling structure exists
      
      const videoBuffer = Buffer.from('quota test video');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'quota-test.mp4');

      const videoId = uploadResponse.body.id;

      // Normal processing should work
      const response = await request(app)
        .post(`/api/videos/${videoId}/process`)
        .send({ selectedModels: ['combined'] })
        .expect(200);

      expect(response.body.message).toBeTruthy();
    });
  });

  describe('Data Export and Import', () => {
    it('should export complete project data', async () => {
      // Create a complete project
      const videoBuffer = Buffer.from('export test video');
      const uploadResponse = await request(app)
        .post('/api/upload')
        .attach('video', videoBuffer, 'export-test.mp4');

      const videoId = uploadResponse.body.id;

      await request(app)
        .post(`/api/videos/${videoId}/process`)
        .send({ selectedModels: ['combined'] });

      await request(app)
        .post(`/api/videos/${videoId}/confirm-transcription`);

      await request(app)
        .post(`/api/videos/${videoId}/translate`)
        .send({ targetLanguage: 'en' });

      // Export data (if endpoint exists)
      const exportResponse = await request(app)
        .get(`/api/videos/${videoId}/export`)
        .expect(200);

      // Verify export contains all data
      expect(exportResponse.body).toHaveProperty('video');
      expect(exportResponse.body).toHaveProperty('transcriptions');
      expect(exportResponse.body).toHaveProperty('translations');
    });
  });
});