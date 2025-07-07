import { 
  videos, 
  transcriptions, 
  translations, 
  dubbingJobs,
  type Video, 
  type InsertVideo,
  type Transcription,
  type InsertTranscription,
  type Translation,
  type InsertTranslation,
  type DubbingJob,
  type InsertDubbingJob
} from "@shared/schema";

export interface IStorage {
  // Video operations
  createVideo(video: InsertVideo): Promise<Video>;
  getVideo(id: number): Promise<Video | undefined>;
  getAllVideos(): Promise<Video[]>;
  updateVideoStatus(id: number, status: string): Promise<void>;
  updateVideoDuration(id: number, duration: number): Promise<void>;

  // Transcription operations
  createTranscription(transcription: InsertTranscription): Promise<Transcription>;
  getTranscriptionsByVideoId(videoId: number): Promise<Transcription[]>;
  updateTranscription(id: number, text: string): Promise<void>;
  
  // Translation operations
  createTranslation(translation: InsertTranslation): Promise<Translation>;
  getTranslationsByTranscriptionId(transcriptionId: number): Promise<Translation[]>;
  updateTranslation(id: number, text: string): Promise<void>;
  
  // Dubbing operations
  createDubbingJob(dubbingJob: InsertDubbingJob): Promise<DubbingJob>;
  getDubbingJobsByVideoId(videoId: number): Promise<DubbingJob[]>;
  updateDubbingJobStatus(id: number, status: string, audioPath?: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private videos: Map<number, Video> = new Map();
  private transcriptions: Map<number, Transcription> = new Map();
  private translations: Map<number, Translation> = new Map();
  private dubbingJobs: Map<number, DubbingJob> = new Map();
  
  private currentVideoId = 1;
  private currentTranscriptionId = 1;
  private currentTranslationId = 1;
  private currentDubbingJobId = 1;

  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const video: Video = {
      ...insertVideo,
      id: this.currentVideoId++,
      duration: insertVideo.duration || null,
      status: insertVideo.status || "uploaded",
      createdAt: new Date(),
    };
    this.videos.set(video.id, video);
    return video;
  }

  async getVideo(id: number): Promise<Video | undefined> {
    return this.videos.get(id);
  }

  async getAllVideos(): Promise<Video[]> {
    return Array.from(this.videos.values());
  }

  async updateVideoStatus(id: number, status: string): Promise<void> {
    const video = this.videos.get(id);
    if (video) {
      video.status = status;
      this.videos.set(id, video);
    }
  }

  async updateVideoDuration(id: number, duration: number): Promise<void> {
    const video = this.videos.get(id);
    if (video) {
      video.duration = duration;
      this.videos.set(id, video);
    }
  }

  async createTranscription(insertTranscription: InsertTranscription): Promise<Transcription> {
    const transcription: Transcription = {
      ...insertTranscription,
      id: this.currentTranscriptionId++,
      videoId: insertTranscription.videoId || null,
      confidence: insertTranscription.confidence || null,
      isOriginal: insertTranscription.isOriginal || null,
      createdAt: new Date(),
    };
    this.transcriptions.set(transcription.id, transcription);
    return transcription;
  }

  async getTranscriptionsByVideoId(videoId: number): Promise<Transcription[]> {
    return Array.from(this.transcriptions.values()).filter(t => t.videoId === videoId);
  }

  async updateTranscription(id: number, text: string): Promise<void> {
    const transcription = this.transcriptions.get(id);
    if (transcription) {
      transcription.text = text;
      this.transcriptions.set(id, transcription);
    }
  }

  async createTranslation(insertTranslation: InsertTranslation): Promise<Translation> {
    const translation: Translation = {
      ...insertTranslation,
      id: this.currentTranslationId++,
      transcriptionId: insertTranslation.transcriptionId || null,
      confidence: insertTranslation.confidence || null,
      createdAt: new Date(),
    };
    this.translations.set(translation.id, translation);
    return translation;
  }

  async getTranslationsByTranscriptionId(transcriptionId: number): Promise<Translation[]> {
    return Array.from(this.translations.values()).filter(t => t.transcriptionId === transcriptionId);
  }

  async updateTranslation(id: number, text: string): Promise<void> {
    const translation = this.translations.get(id);
    if (translation) {
      translation.translatedText = text;
      this.translations.set(id, translation);
    }
  }

  async createDubbingJob(insertDubbingJob: InsertDubbingJob): Promise<DubbingJob> {
    const dubbingJob: DubbingJob = {
      ...insertDubbingJob,
      id: this.currentDubbingJobId++,
      videoId: insertDubbingJob.videoId || null,
      status: insertDubbingJob.status || "pending",
      audioPath: insertDubbingJob.audioPath || null,
      jobId: insertDubbingJob.jobId || null,
      createdAt: new Date(),
    };
    this.dubbingJobs.set(dubbingJob.id, dubbingJob);
    return dubbingJob;
  }

  async getDubbingJobsByVideoId(videoId: number): Promise<DubbingJob[]> {
    return Array.from(this.dubbingJobs.values()).filter(d => d.videoId === videoId);
  }

  async updateDubbingJobStatus(id: number, status: string, audioPath?: string): Promise<void> {
    const dubbingJob = this.dubbingJobs.get(id);
    if (dubbingJob) {
      dubbingJob.status = status;
      if (audioPath) {
        dubbingJob.audioPath = audioPath;
      }
      this.dubbingJobs.set(id, dubbingJob);
    }
  }
}

export const storage = new MemStorage();
