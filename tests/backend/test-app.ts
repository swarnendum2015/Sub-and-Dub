import express from 'express';
import multer from 'multer';
import { MemStorage } from '../../server/storage';
import { mockVideo, mockTranscriptions, mockTranslations, mockDubbingJobs } from '../fixtures/sample-data';

export async function createTestApp() {
  const app = express();
  app.use(express.json());
  
  // Use memory storage for testing
  const storage = new MemStorage();
  
  // Pre-populate with test data
  await storage.createVideo({
    filename: mockVideo.filename,
    originalName: mockVideo.originalName,
    filePath: mockVideo.filePath,
    fileSize: mockVideo.fileSize,
    status: mockVideo.status,
    duration: mockVideo.duration,
    bengaliConfirmed: mockVideo.bengaliConfirmed,
  });

  // Add transcriptions
  for (const transcription of mockTranscriptions) {
    await storage.createTranscription({
      videoId: transcription.videoId,
      startTime: transcription.startTime,
      endTime: transcription.endTime,
      text: transcription.text,
      confidence: transcription.confidence,
      model: transcription.model,
      speakerId: transcription.speakerId,
      speakerName: transcription.speakerName,
    });
  }

  // Add translations
  for (const translation of mockTranslations) {
    await storage.createTranslation({
      transcriptionId: translation.transcriptionId,
      targetLanguage: translation.targetLanguage,
      text: translation.text,
      confidence: translation.confidence,
      model: translation.model,
    });
  }

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['video/mp4', 'video/mov', 'video/avi', 'video/mkv'];
      if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.mp4') || file.originalname.endsWith('.mov') || file.originalname.endsWith('.avi')) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type'));
      }
    },
  });

  // Routes
  app.get('/api/videos', async (req, res) => {
    try {
      const videos = await storage.getAllVideos();
      res.json(videos);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get videos' });
    }
  });

  app.get('/api/videos/:id', async (req, res) => {
    try {
      const video = await storage.getVideo(parseInt(req.params.id));
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }
      res.json(video);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get video' });
    }
  });

  app.post('/api/upload', upload.single('video'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
      }

      const video = await storage.createVideo({
        filename: req.file.filename || req.file.originalname,
        originalName: req.file.originalname,
        filePath: `/uploads/${req.file.originalname}`,
        fileSize: req.file.size,
        status: 'uploaded',
        duration: null,
        bengaliConfirmed: false,
      });

      res.json(video);
    } catch (error) {
      res.status(500).json({ error: 'Failed to upload video' });
    }
  });

  app.post('/api/videos/:id/process', async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const { selectedModels } = req.body;

      // Mock transcription processing
      await storage.updateVideoStatus(videoId, 'processing');
      
      // Simulate transcription creation
      const mockTranscription = await storage.createTranscription({
        videoId,
        startTime: 0,
        endTime: 10,
        text: 'মক ট্রান্সক্রিপশন টেক্সট',
        confidence: 0.9,
        model: selectedModels[0] || 'openai',
        speakerId: '1',
        speakerName: 'Speaker 1',
      });

      await storage.updateVideoStatus(videoId, 'completed');
      
      res.json({ message: 'Processing completed', transcriptions: [mockTranscription] });
    } catch (error) {
      res.status(500).json({ error: 'Failed to process video' });
    }
  });

  app.post('/api/videos/:id/confirm-transcription', async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      await storage.updateVideoBengaliConfirmed(videoId, true);
      res.json({ message: 'Bengali transcription confirmed' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to confirm transcription' });
    }
  });

  app.get('/api/transcriptions', async (req, res) => {
    try {
      const videoId = parseInt(req.query.videoId as string);
      const transcriptions = await storage.getTranscriptionsByVideoId(videoId);
      res.json(transcriptions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get transcriptions' });
    }
  });

  app.patch('/api/transcriptions/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { text } = req.body;
      await storage.updateTranscription(id, text);
      res.json({ id, text });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update transcription' });
    }
  });

  app.post('/api/videos/:id/translate', async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const { targetLanguage } = req.body;

      if (!['en', 'hi', 'ta', 'te', 'ml'].includes(targetLanguage)) {
        return res.status(400).json({ error: 'Invalid target language' });
      }

      // Mock translation creation
      const transcriptions = await storage.getTranscriptionsByVideoId(videoId);
      const translations = [];

      for (const transcription of transcriptions) {
        const translation = await storage.createTranslation({
          transcriptionId: transcription.id,
          targetLanguage,
          text: `Translated: ${transcription.text}`,
          confidence: 0.9,
          model: 'gemini-batch',
        });
        translations.push(translation);
      }

      res.json({ message: 'Translation completed', translations });
    } catch (error) {
      res.status(500).json({ error: 'Failed to translate' });
    }
  });

  app.get('/api/translations', async (req, res) => {
    try {
      const videoId = parseInt(req.query.videoId as string);
      const transcriptions = await storage.getTranscriptionsByVideoId(videoId);
      const allTranslations = [];

      for (const transcription of transcriptions) {
        const translations = await storage.getTranslationsByTranscriptionId(transcription.id);
        allTranslations.push(...translations);
      }

      res.json(allTranslations);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get translations' });
    }
  });

  app.patch('/api/translations/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { text } = req.body;
      await storage.updateTranslation(id, text);
      res.json({ id, text });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update translation' });
    }
  });

  app.post('/api/videos/:id/dubbing', async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const { language, voiceIds, dubbingType } = req.body;

      const dubbingJob = await storage.createDubbingJob({
        videoId,
        language,
        status: 'pending',
        audioPath: null,
        jobId: `test-job-${Date.now()}`,
      });

      res.json(dubbingJob);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create dubbing job' });
    }
  });

  app.get('/api/dubbing-jobs', async (req, res) => {
    try {
      const videoId = parseInt(req.query.videoId as string);
      const dubbingJobs = await storage.getDubbingJobsByVideoId(videoId);
      res.json(dubbingJobs);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get dubbing jobs' });
    }
  });

  app.get('/api/videos/:id/srt', async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const language = req.query.language as string;

      // Generate properly formatted SRT content
      const srtContent = `1
00:00:00,000 --> 00:00:05,000
Sample subtitle in ${language}

2
00:00:05,000 --> 00:00:10,000
Another subtitle line

`;

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="subtitles-${language}.srt"`);
      res.send(srtContent);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate SRT' });
    }
  });

  app.get('/api/videos/:id/export', async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const video = await storage.getVideo(videoId);
      
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }

      const transcriptions = await storage.getTranscriptionsByVideoId(videoId);
      const allTranslations = [];

      for (const transcription of transcriptions) {
        const translations = await storage.getTranslationsByTranscriptionId(transcription.id);
        allTranslations.push(...translations);
      }

      const exportData = {
        video,
        transcriptions,
        translations: allTranslations,
      };

      res.json(exportData);
    } catch (error) {
      res.status(500).json({ error: 'Failed to export data' });
    }
  });

  // Error handling middleware
  app.use((error: any, req: any, res: any, next: any) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large' });
      }
    }
    if (error.message === 'Invalid file type') {
      return res.status(400).json({ error: 'Invalid file type' });
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}