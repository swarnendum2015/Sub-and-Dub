import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertVideoSchema } from "@shared/schema";
import { transcribeVideo, transcribeVideoFallback } from "./services/transcription-new";
import { translateText, retranslateText } from "./services/translation-new";
import { generateDubbingSimple } from "./services/dubbing-simple";
import { generateSRT } from "./routes/srt";
import { detectLanguageFromVideo, getSupportedLanguages } from "./services/language-detection-new";
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp4', '.mov', '.avi', '.mkv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Upload video and analyze
  app.post("/api/videos/upload", upload.single("video"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const video = await storage.createVideo({
        filename: req.file.filename,
        originalName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        status: "uploaded",
      });

      // Start background analysis (language detection only)
      analyzeVideoWithTimeout(video.id).catch(error => {
        console.error(`Failed to analyze video ${video.id}:`, error);
      });

      res.json(video);
    } catch (error) {
      res.status(500).json({ message: "Upload failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get all videos
  app.get("/api/videos", async (req, res) => {
    try {
      const videos = await storage.getAllVideos();
      res.json(videos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch videos", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get video by ID
  app.get("/api/videos/:id", async (req, res) => {
    try {
      const video = await storage.getVideo(parseInt(req.params.id));
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      res.json(video);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch video", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get video status
  app.get("/api/videos/:id/status", async (req, res) => {
    try {
      const video = await storage.getVideo(parseInt(req.params.id));
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      res.json({ 
        id: video.id, 
        status: video.status, 
        duration: video.duration,
        sourceLanguage: video.sourceLanguage,
        bengaliConfirmed: video.bengaliConfirmed 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch video status", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get video file details
  app.get("/api/videos/:id/details", async (req, res) => {
    try {
      const details = await storage.getFileDetailsByVideoId(parseInt(req.params.id));
      res.json(details || null);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch file details", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Create file details for existing video (admin endpoint)
  app.post("/api/videos/:id/create-file-details", async (req, res) => {
    try {
      const video = await storage.getVideo(parseInt(req.params.id));
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      await createFileDetails(video);
      const details = await storage.getFileDetailsByVideoId(video.id);
      res.json(details);
    } catch (error) {
      res.status(500).json({ message: "Failed to create file details", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Test endpoint for batch translation functionality
  app.post("/api/test-batch-translation", async (req: Request, res: Response) => {
    try {
      // Create a test video with confirmed Bengali transcriptions using actual video file
      const testVideo = await storage.createVideo({
        filename: "birangana-test.mov",
        originalName: "Birangana Test Video.mov",
        filePath: "attached_assets/Birangana Trailer Revised3_1751984055833.mov",
        fileSize: 32560929,
        status: "completed",
      });
      
      // Set Bengali as confirmed
      await storage.updateVideoBengaliConfirmed(testVideo.id, true);
      
      // Create sample Bengali transcriptions
      const sampleTranscriptions = [
        { videoId: testVideo.id, language: "bn", text: "এই একটি পরীক্ষা।", startTime: 0, endTime: 2, confidence: 0.9, isOriginal: true },
        { videoId: testVideo.id, language: "bn", text: "আমি বাংলায় কথা বলছি।", startTime: 2, endTime: 4, confidence: 0.9, isOriginal: true },
        { videoId: testVideo.id, language: "bn", text: "এটি অনুবাদ পরীক্ষার জন্য।", startTime: 4, endTime: 6, confidence: 0.9, isOriginal: true }
      ];
      
      for (const trans of sampleTranscriptions) {
        await storage.createTranscription(trans);
      }
      
      res.json({ 
        message: "Test video created successfully", 
        videoId: testVideo.id,
        status: "Ready for batch translation testing"
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get single video
  app.get("/api/videos/:id", async (req, res) => {
    try {
      const video = await storage.getVideo(parseInt(req.params.id));
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      res.json(video);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch video", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });



  // Process video endpoint
  app.post("/api/videos/:id/process", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const { models } = req.body;
      const video = await storage.getVideo(videoId);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      // Start processing in the background with timeout and selected models
      processVideoWithTimeout(videoId, models).catch(console.error);
      
      res.json({ message: "Video processing started", videoId: videoId });
    } catch (error) {
      res.status(500).json({ message: "Failed to start video processing", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Serve video files
  app.get("/api/videos/:id/stream", async (req, res) => {
    try {
      const video = await storage.getVideo(parseInt(req.params.id));
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      if (!fs.existsSync(video.filePath)) {
        return res.status(404).json({ message: "Video file not found" });
      }

      const stat = fs.statSync(video.filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(video.filePath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(video.filePath).pipe(res);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to stream video", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get transcriptions for a video
  app.get("/api/videos/:id/transcriptions", async (req, res) => {
    try {
      const transcriptions = await storage.getTranscriptionsByVideoId(parseInt(req.params.id));
      res.json(transcriptions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transcriptions", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Update transcription text
  app.patch("/api/transcriptions/:id", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }
      
      await storage.updateTranscription(parseInt(req.params.id), text);
      res.json({ message: "Transcription updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update transcription", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Delete transcription
  app.delete("/api/transcriptions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transcription ID" });
      }
      
      await storage.deleteTranscription(id);
      res.json({ message: "Transcription deleted successfully" });
    } catch (error) {
      console.error("Failed to delete transcription:", error);
      res.status(500).json({ message: "Failed to delete transcription", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Switch between primary and alternative transcription
  app.post("/api/transcriptions/:id/switch-alternative", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transcription ID" });
      }
      
      await storage.switchAlternativeTranscription(id);
      res.json({ message: "Alternative transcription selected successfully" });
    } catch (error) {
      console.error("Failed to switch alternative transcription:", error);
      res.status(500).json({ message: "Failed to switch alternative transcription", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get translations for a transcription
  app.get("/api/transcriptions/:id/translations", async (req, res) => {
    try {
      const translations = await storage.getTranslationsByTranscriptionId(parseInt(req.params.id));
      res.json(translations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch translations", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Update translation text
  app.patch("/api/translations/:id", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }
      
      await storage.updateTranslation(parseInt(req.params.id), text);
      res.json({ message: "Translation updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update translation", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Generate dubbing for a video using ElevenLabs Dubbing Studio
  app.post("/api/videos/:id/dubbing", async (req, res) => {
    try {
      const { language, voiceId } = req.body;
      if (!language) {
        return res.status(400).json({ message: "Language is required" });
      }

      const dubbingJob = await storage.createDubbingJob({
        videoId: parseInt(req.params.id),
        language: language,
        voiceId: voiceId || undefined,
        status: "pending",
      });

      console.log(`[DUBBING] Starting ElevenLabs Dubbing Studio for job ${dubbingJob.id}`);

      // Start background dubbing process using ElevenLabs Dubbing Studio
      const { generateDubbingWithStudio } = await import('./services/dubbing-elevenlabs');
      generateDubbingWithStudio({ dubbingJobId: dubbingJob.id }).catch(console.error);

      res.json(dubbingJob);
    } catch (error) {
      res.status(500).json({ message: "Failed to start dubbing job", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get dubbing jobs for a video
  app.get("/api/videos/:id/dubbing", async (req, res) => {
    try {
      const dubbingJobs = await storage.getDubbingJobsByVideoId(parseInt(req.params.id));
      res.json(dubbingJobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dubbing jobs", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  
  // Confirm Bengali transcription (primary endpoint)
  app.post("/api/videos/:id/confirm-transcription", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const video = await storage.getVideo(videoId);
      
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      // Update video Bengali confirmation status
      await storage.updateVideoBengaliConfirmed(videoId, true);
      console.log(`[CONFIRM] Bengali transcription confirmed for video ${videoId}`);
      
      res.json({ message: "Bengali transcription confirmed successfully", videoId });
    } catch (error) {
      console.error("Error confirming transcription:", error);
      res.status(500).json({ message: "Failed to confirm transcription", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Unconfirm Bengali transcription
  app.post("/api/videos/:id/unconfirm-transcription", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const video = await storage.getVideo(videoId);
      
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      // Update video Bengali confirmation status to false
      await storage.updateVideoBengaliConfirmed(videoId, false);
      
      res.json({ message: "Bengali transcription unconfirmed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to unconfirm transcription", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Fix stuck jobs endpoint
  app.post("/api/admin/fix-stuck-jobs", async (req: Request, res: Response) => {
    try {
      const videos = await storage.getAllVideos();
      const stuckVideos = [];
      const currentTime = Date.now();
      const PROCESSING_TIMEOUT = 10 * 60 * 1000; // 10 minutes
      
      for (const video of videos) {
        if (video.status === 'processing') {
          const processingTime = currentTime - new Date(video.updatedAt).getTime();
          if (processingTime > PROCESSING_TIMEOUT) {
            await storage.updateVideoStatus(video.id, 'failed');
            stuckVideos.push(video.id);
          }
        }
      }
      
      res.json({ 
        message: `Fixed ${stuckVideos.length} stuck jobs`,
        videoIds: stuckVideos 
      });
    } catch (error) {
      console.error("Error fixing stuck jobs:", error);
      res.status(500).json({ error: "Failed to fix stuck jobs" });
    }
  });
  
  // Retry failed video with automatic fallback
  app.post("/api/videos/:id/retry", async (req: Request, res: Response) => {
    const videoId = parseInt(req.params.id);
    
    try {
      const video = await storage.getVideo(videoId);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      if (video.status !== 'failed' && video.status !== 'processing') {
        return res.status(400).json({ error: "Video is not in a retriable state" });
      }
      
      // Clear error information
      await storage.updateVideoErrorInfo(videoId, { 
        code: '', 
        message: '', 
        retryable: true 
      });
      
      // Reset status and restart processing
      await storage.updateVideoStatus(videoId, 'pending');
      processVideoWithTimeout(videoId).catch(console.error);
      
      res.json({ message: "Video processing restarted" });
    } catch (error) {
      console.error("Error retrying video:", error);
      res.status(500).json({ error: "Failed to retry video" });
    }
  });
  

  
  // Translate video to specific language using batch processing
  app.post("/api/videos/:id/translate", async (req: Request, res: Response) => {
    const videoId = parseInt(req.params.id);
    const { targetLanguage } = req.body;
    
    if (!targetLanguage) {
      return res.status(400).json({ error: "Target language is required" });
    }
    
    try {
      console.log(`[TRANSLATE] Starting batch translation for video ${videoId} to ${targetLanguage}`);
      
      // Use the new batch translation service
      const { translateVideoBatch } = await import('./services/translation-batch');
      const translations = await translateVideoBatch({ videoId, targetLanguage });
      
      res.json({ 
        message: `Batch translation completed for ${translations.length} segments`,
        translations 
      });
      
    } catch (error) {
      console.error("Batch translation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Translation failed" 
      });
    }
  });

  // Re-translate specific transcription
  app.post("/api/transcriptions/:id/retranslate", async (req, res) => {
    try {
      const transcriptionId = parseInt(req.params.id);
      const { targetLanguage } = req.body;
      
      console.log(`Re-translating transcription ${transcriptionId} to ${targetLanguage}`);
      
      await retranslateText(transcriptionId, targetLanguage);
      res.json({ message: "Re-translation completed successfully" });
    } catch (error) {
      console.error("Error in re-translation:", error);
      res.status(500).json({ message: "Re-translation failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Download dubbing audio
  app.get("/api/videos/:videoId/dubbing/:dubbingId/download", async (req, res) => {
    try {
      const dubbingJobs = await storage.getDubbingJobsByVideoId(parseInt(req.params.videoId));
      const dubbingJob = dubbingJobs.find(job => job.id === parseInt(req.params.dubbingId));
      
      if (!dubbingJob || !dubbingJob.audioPath) {
        return res.status(404).json({ error: "Dubbing not found" });
      }
      
      const audioPath = dubbingJob.audioPath;
      if (!fs.existsSync(audioPath)) {
        return res.status(404).json({ error: "Audio file not found" });
      }
      
      const filename = `${dubbingJob.language}_dubbing.mp3`;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      fs.createReadStream(audioPath).pipe(res);
    } catch (error) {
      console.error("Error downloading dubbing:", error);
      res.status(500).json({ error: "Failed to download dubbing" });
    }
  });

  // Export SRT subtitles
  app.get("/api/videos/:id/srt", generateSRT);

  const httpServer = createServer(app);
  // S3 video upload endpoint
  app.post("/api/videos/upload-s3", async (req, res) => {
    try {
      const { s3Url, selectedModels } = req.body;
      
      if (!s3Url) {
        return res.status(400).json({ error: "S3 URL is required" });
      }
      
      // Validate S3 URL pattern
      const s3Pattern = /^https?:\/\/[^\/]+\.s3[^\/]*\.amazonaws\.com\/.*$|^https?:\/\/s3[^\/]*\.amazonaws\.com\/[^\/]+\/.*$/;
      if (!s3Pattern.test(s3Url)) {
        return res.status(400).json({ error: "Invalid S3 URL format" });
      }
      
      const video = await storage.createVideo({
        filename: s3Url.split('/').pop() || 'S3_Video',
        originalName: s3Url.split('/').pop() || 'S3_Video',
        filePath: s3Url,
        status: 'pending',
      });
      
      // Start processing the video with selected models
      processVideoWithTimeout(video.id, selectedModels).catch(console.error);
      
      res.json({ videoId: video.id, message: "S3 video processing started" });
    } catch (error) {
      console.error("Error processing S3 video:", error);
      res.status(500).json({ error: "Failed to process S3 video" });
    }
  });

  // YouTube video upload endpoint
  app.post("/api/videos/upload-youtube", async (req, res) => {
    try {
      const { youtubeUrl, selectedModels } = req.body;
      
      if (!youtubeUrl) {
        return res.status(400).json({ error: "YouTube URL is required" });
      }
      
      // Validate YouTube URL pattern
      const youtubePattern = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
      if (!youtubePattern.test(youtubeUrl)) {
        return res.status(400).json({ error: "Invalid YouTube URL format" });
      }
      
      // Extract video ID from URL
      const videoId = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
      if (!videoId) {
        return res.status(400).json({ error: "Could not extract video ID from YouTube URL" });
      }
      
      const video = await storage.createVideo({
        filename: `youtube_${videoId}`,
        originalName: `YouTube: ${videoId}`,
        filePath: youtubeUrl,
        status: 'pending',
      });
      
      // Start processing the video with selected models
      processVideoWithTimeout(video.id, selectedModels).catch(console.error);
      
      res.json({ videoId: video.id, message: "YouTube video processing started" });
    } catch (error) {
      console.error("Error processing YouTube video:", error);
      res.status(500).json({ error: "Failed to process YouTube video" });
    }
  });

  // Get supported languages for dropdowns
  app.get("/api/languages", async (req, res) => {
    try {
      const languages = getSupportedLanguages();
      res.json(languages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch supported languages", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Select services for analyzed video
  app.post("/api/videos/:id/select-services", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const { services, models, targetLanguages, sourceLanguage } = req.body;
      
      if (!services || !Array.isArray(services)) {
        return res.status(400).json({ message: "Services array is required" });
      }
      
      const video = await storage.getVideo(videoId);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      if (video.status !== "analyzed") {
        return res.status(400).json({ message: "Video must be analyzed first" });
      }
      
      // Save service selections
      await storage.updateVideoServices(videoId, services, models || [], targetLanguages || []);
      
      // Update source language if provided
      if (sourceLanguage && sourceLanguage !== video.sourceLanguage) {
        await storage.updateVideoSourceLanguage(videoId, sourceLanguage, 1.0);
      }
      
      // Start processing based on selected services
      processVideoWithTimeout(videoId, models).catch(error => {
        console.error(`Failed to process video ${videoId}:`, error);
      });
      
      res.json({ message: "Service selection saved and processing started" });
    } catch (error) {
      res.status(500).json({ message: "Failed to select services", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  return httpServer;
}

// Background analysis function with timeout
async function analyzeVideoWithTimeout(videoId: number) {
  const ANALYSIS_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  
  const timeout = setTimeout(() => {
    console.error(`Analysis timeout for video ${videoId}`);
    storage.updateVideoStatus(videoId, "failed").catch(error => {
      console.error(`Failed to update video status after timeout:`, error);
    });
  }, ANALYSIS_TIMEOUT);
  
  try {
    await analyzeVideo(videoId);
  } catch (error) {
    console.error(`Background analysis failed for video ${videoId}:`, error);
    try {
      await storage.updateVideoStatus(videoId, "failed");
    } catch (updateError) {
      console.error(`Failed to update video status after analysis error:`, updateError);
    }
  } finally {
    clearTimeout(timeout);
  }
}

// Background analysis function
async function analyzeVideo(videoId: number) {
  try {
    console.log(`[ANALYZE] Starting video analysis for ID: ${videoId}`);
    await storage.updateVideoStatus(videoId, "analyzing");
    
    const video = await storage.getVideo(videoId);
    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }
    
    // Detect source language with fallback
    console.log(`[ANALYZE] Detecting language for video ${videoId}`);
    let languageResult;
    try {
      languageResult = await detectLanguageFromVideo(video.filePath);
      await storage.updateVideoSourceLanguage(videoId, languageResult.language, languageResult.confidence);
    } catch (languageError) {
      console.error(`[ANALYZE] Language detection failed, using Bengali default:`, languageError);
      // Default to Bengali if detection fails
      languageResult = { language: 'bn', confidence: 0.7, languageName: 'Bengali' };
      await storage.updateVideoSourceLanguage(videoId, 'bn', 0.7);
    }
    
    // Mark as analyzed and start processing automatically
    await storage.updateVideoStatus(videoId, "analyzed");
    
    console.log(`[ANALYZE] Analysis completed for video ${videoId}. Detected language: ${languageResult.languageName} (${languageResult.confidence})`);
    
    // Analysis complete - ready for manual transcription trigger
    console.log(`[ANALYZE] Analysis completed. Ready for manual transcription trigger.`);
    
  } catch (error) {
    console.error(`[ANALYZE] Analysis error for video ${videoId}:`, error);
    await storage.updateVideoStatus(videoId, "failed");
    throw error;
  }
}

// Background processing function with timeout
async function processVideoWithTimeout(videoId: number, selectedModels?: string[]) {
  const PROCESSING_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  
  const timeout = setTimeout(() => {
    console.error(`Processing timeout for video ${videoId}`);
    storage.updateVideoStatus(videoId, "failed").catch(error => {
      console.error(`Failed to update video status after timeout:`, error);
    });
  }, PROCESSING_TIMEOUT);
  
  try {
    await processVideo(videoId, selectedModels);
  } catch (error) {
    console.error(`Background processing failed for video ${videoId}:`, error);
    try {
      await storage.updateVideoStatus(videoId, "failed");
    } catch (updateError) {
      console.error(`Failed to update video status after processing error:`, updateError);
    }
  } finally {
    clearTimeout(timeout);
  }
}

// Background processing function
async function processVideo(videoId: number, selectedModels?: string[]) {
  try {
    console.log(`[PROCESS] Starting video processing for ID: ${videoId}`);
    await storage.updateVideoStatus(videoId, "processing");
    
    // Transcribe video (Bengali only) with selected models and automatic fallback
    console.log(`[PROCESS] Starting Bengali transcription for video ${videoId} with models:`, selectedModels);
    try {
      const transcriptions = await transcribeVideo(videoId, selectedModels);
      console.log(`[PROCESS] Bengali transcription completed. Found ${transcriptions?.length || 0} transcriptions for video ${videoId}`);
    } catch (transcribeError) {
      console.error(`[PROCESS] Transcription error for video ${videoId}:`, transcribeError);
      
      // Check if this is a quota error and we can fallback
      const errorClassification = classifyError(transcribeError);
      if (errorClassification.code === 'API_QUOTA_EXCEEDED') {
        console.log(`[PROCESS] Quota exceeded, attempting fallback transcription for video ${videoId}`);
        try {
          // Try fallback transcription service
          const fallbackTranscriptions = await transcribeVideoFallback(videoId);
          console.log(`[PROCESS] Fallback transcription completed. Found ${fallbackTranscriptions?.length || 0} transcriptions for video ${videoId}`);
        } catch (fallbackError) {
          console.error(`[PROCESS] Fallback transcription also failed for video ${videoId}:`, fallbackError);
          throw fallbackError;
        }
      } else {
        throw transcribeError;
      }
    }
    
    // Create file details after successful transcription
    const video = await storage.getVideo(videoId);
    if (video) {
      await createFileDetails(video);
    }
    
    // DO NOT generate translations automatically
    // Translations will only happen after user confirms Bengali transcription
    console.log(`[PROCESS] Video transcription completed. Waiting for user confirmation before translation.`);
    
    await storage.updateVideoStatus(videoId, "completed");
    console.log(`[PROCESS] Video processing completed for ID: ${videoId}`);
  } catch (error) {
    console.error(`[PROCESS] Processing failed for video ${videoId}:`, error);
    console.error(`[PROCESS] Error details:`, error instanceof Error ? error.stack : error);
    
    // Classify error and determine appropriate response
    const errorClassification = classifyError(error);
    
    await storage.updateVideoStatus(videoId, "failed");
    
    // Store error details for UI display
    await storage.updateVideoErrorInfo(videoId, errorClassification);
  }
}

// Classify errors for better user messaging
function classifyError(error: any): { code: string; message: string; retryable: boolean } {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Database constraint errors
  if (error.code === '23502' || errorMessage.includes('violates not-null constraint')) {
    return {
      code: 'DATABASE_CONSTRAINT',
      message: 'Data processing error. Please retry or contact support.',
      retryable: true
    };
  }
  
  // API Quota errors
  if (errorMessage.includes('QUOTA_EXCEEDED') || errorMessage.includes('rate limit') || 
      errorMessage.includes('quota exceeded') || errorMessage.includes('429')) {
    return {
      code: 'API_QUOTA_EXCEEDED',
      message: 'Transcription service quota reached—switching to fallback engine.',
      retryable: true
    };
  }
  
  // Codec/Format errors
  if (errorMessage.includes('codec') || errorMessage.includes('format not supported') || 
      errorMessage.includes('unsupported') || errorMessage.includes('Invalid data found')) {
    return {
      code: 'UNSUPPORTED_FORMAT',
      message: 'Transcoding failed: unsupported video codec. Please convert to H.264 MP4.',
      retryable: false
    };
  }
  
  // File not found errors
  if (errorMessage.includes('ENOENT') || errorMessage.includes('No such file')) {
    return {
      code: 'FILE_NOT_FOUND',
      message: 'Video file not found. Please re-upload your video.',
      retryable: false
    };
  }
  
  // Network/Connection errors
  if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network') || 
      errorMessage.includes('timeout')) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Network connection failed. Please check your internet and retry.',
      retryable: true
    };
  }
  
  // Default fallback
  return {
    code: 'UNKNOWN_ERROR',
    message: 'Processing failed. This could be due to API limits or file format issues.',
    retryable: true
  };
}

// Create file details for a video
async function createFileDetails(video: any) {
  try {
    console.log(`[FILE_DETAILS] Creating file details for video ${video.id}`);
    
    // Get video metadata using ffprobe
    const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_format -show_streams "${video.filePath}"`);
    const metadata = JSON.parse(stdout);
    
    // Find video stream
    const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
    const audioStream = metadata.streams.find((s: any) => s.codec_type === 'audio');
    
    // Extract audio path (constructed from video path)
    const audioPath = `${video.filePath}.wav`;
    
    // Create file details record
    await storage.createFileDetails({
      videoId: video.id,
      codec: videoStream?.codec_name || null,
      resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : null,
      fps: videoStream?.r_frame_rate ? parseFloat(videoStream.r_frame_rate.split('/')[0]) / parseFloat(videoStream.r_frame_rate.split('/')[1]) : null,
      bitrate: videoStream?.bit_rate ? parseInt(videoStream.bit_rate) : null,
      audioCodec: audioStream?.codec_name || null,
      audioSampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate) : null,
      audioChannels: audioStream?.channels || null,
      extractedAudioPath: audioPath,
      thumbnailPath: null,
      metadataJson: JSON.stringify(metadata),
    });
    
    console.log(`[FILE_DETAILS] File details created for video ${video.id}`);
  } catch (error) {
    console.error(`[FILE_DETAILS] Failed to create file details for video ${video.id}:`, error);
  }
}
