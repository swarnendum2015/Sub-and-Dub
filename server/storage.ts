import { 
  videos, 
  transcriptions, 
  translations, 
  dubbingJobs,
  fileDetails,
  type Video, 
  type InsertVideo,
  type Transcription,
  type InsertTranscription,
  type Translation,
  type InsertTranslation,
  type DubbingJob,
  type InsertDubbingJob,
  type FileDetails,
  type InsertFileDetails
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Video operations
  createVideo(video: InsertVideo): Promise<Video>;
  getVideo(id: number): Promise<Video | undefined>;
  getAllVideos(): Promise<Video[]>;
  updateVideoStatus(id: number, status: string): Promise<void>;
  updateVideoDuration(id: number, duration: number): Promise<void>;
  updateVideoBengaliConfirmed(id: number, confirmed: boolean): Promise<void>;
  updateVideoSourceLanguage(id: number, language: string, confidence: number): Promise<void>;
  updateVideoServices(id: number, services: string[], models: string[], targetLanguages: string[]): Promise<void>;

  // Transcription operations
  createTranscription(transcription: InsertTranscription): Promise<Transcription>;
  getTranscriptionsByVideoId(videoId: number): Promise<Transcription[]>;
  updateTranscription(id: number, text: string): Promise<void>;
  deleteTranscription(id: number): Promise<void>;
  switchAlternativeTranscription(id: number): Promise<void>;
  
  // Translation operations
  createTranslation(translation: InsertTranslation): Promise<Translation>;
  getTranslationsByTranscriptionId(transcriptionId: number): Promise<Translation[]>;
  updateTranslation(id: number, text: string, confidence?: number): Promise<void>;
  
  // Dubbing operations
  createDubbingJob(dubbingJob: InsertDubbingJob): Promise<DubbingJob>;
  getDubbingJobsByVideoId(videoId: number): Promise<DubbingJob[]>;
  getDubbingJob(id: number): Promise<DubbingJob | undefined>;
  updateDubbingJobStatus(id: number, status: string, audioPath?: string): Promise<void>;
  
  // File details operations
  createFileDetails(fileDetailsData: InsertFileDetails): Promise<FileDetails>;
  getFileDetailsByVideoId(videoId: number): Promise<FileDetails | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const [video] = await db
      .insert(videos)
      .values(insertVideo)
      .returning();
    return video;
  }

  async getVideo(id: number): Promise<Video | undefined> {
    const [video] = await db.select().from(videos).where(eq(videos.id, id));
    return video || undefined;
  }

  async getAllVideos(): Promise<Video[]> {
    return await db.select().from(videos);
  }

  async updateVideoStatus(id: number, status: string): Promise<void> {
    await db.update(videos).set({ status }).where(eq(videos.id, id));
  }

  async updateVideoDuration(id: number, duration: number): Promise<void> {
    await db.update(videos).set({ duration }).where(eq(videos.id, id));
  }

  async updateVideoBengaliConfirmed(id: number, confirmed: boolean): Promise<void> {
    await db.update(videos).set({ bengaliConfirmed: confirmed }).where(eq(videos.id, id));
  }

  async updateVideoSourceLanguage(id: number, language: string, confidence: number): Promise<void> {
    await db.update(videos).set({ 
      sourceLanguage: language,
      sourceLanguageConfidence: confidence 
    }).where(eq(videos.id, id));
  }

  async updateVideoServices(id: number, services: string[], models: string[], targetLanguages: string[]): Promise<void> {
    await db.update(videos).set({
      selectedServices: JSON.stringify(services),
      selectedModels: JSON.stringify(models),
      targetLanguages: JSON.stringify(targetLanguages)
    }).where(eq(videos.id, id));
  }

  async createTranscription(insertTranscription: InsertTranscription): Promise<Transcription> {
    const [transcription] = await db
      .insert(transcriptions)
      .values(insertTranscription)
      .returning();
    return transcription;
  }

  async getTranscriptionsByVideoId(videoId: number): Promise<Transcription[]> {
    return await db.select().from(transcriptions).where(eq(transcriptions.videoId, videoId));
  }

  async updateTranscription(id: number, text: string): Promise<void> {
    await db.update(transcriptions).set({ text }).where(eq(transcriptions.id, id));
  }

  async deleteTranscription(id: number): Promise<void> {
    // First delete all associated translations
    await db.delete(translations).where(eq(translations.transcriptionId, id));
    // Then delete the transcription
    await db.delete(transcriptions).where(eq(transcriptions.id, id));
  }

  async switchAlternativeTranscription(id: number): Promise<void> {
    const [transcription] = await db.select().from(transcriptions).where(eq(transcriptions.id, id));
    if (!transcription || !transcription.alternativeText) {
      throw new Error("No alternative transcription available");
    }
    
    // Swap primary and alternative text
    const currentText = transcription.text;
    const currentModelSource = transcription.modelSource;
    
    await db.update(transcriptions).set({
      text: transcription.alternativeText,
      modelSource: transcription.alternativeModelSource,
      alternativeText: currentText,
      alternativeModelSource: currentModelSource,
      isAlternativeSelected: !transcription.isAlternativeSelected
    }).where(eq(transcriptions.id, id));
  }

  async createTranslation(insertTranslation: InsertTranslation): Promise<Translation> {
    const [translation] = await db
      .insert(translations)
      .values(insertTranslation)
      .returning();
    return translation;
  }

  async getTranslationsByTranscriptionId(transcriptionId: number): Promise<Translation[]> {
    return await db.select().from(translations).where(eq(translations.transcriptionId, transcriptionId));
  }

  async updateTranslation(id: number, text: string, confidence?: number): Promise<void> {
    const updateData: any = { translatedText: text };
    if (confidence !== undefined) updateData.confidence = confidence;
    await db.update(translations).set(updateData).where(eq(translations.id, id));
  }

  async createDubbingJob(insertDubbingJob: InsertDubbingJob): Promise<DubbingJob> {
    const [dubbingJob] = await db
      .insert(dubbingJobs)
      .values(insertDubbingJob)
      .returning();
    return dubbingJob;
  }

  async getDubbingJobsByVideoId(videoId: number): Promise<DubbingJob[]> {
    return await db.select().from(dubbingJobs).where(eq(dubbingJobs.videoId, videoId));
  }
  
  async getDubbingJob(id: number): Promise<DubbingJob | undefined> {
    const [job] = await db.select().from(dubbingJobs).where(eq(dubbingJobs.id, id));
    return job || undefined;
  }

  async updateDubbingJobStatus(id: number, status: string, audioPath?: string): Promise<void> {
    const updateData: any = { status };
    if (audioPath) updateData.audioPath = audioPath;
    await db.update(dubbingJobs).set(updateData).where(eq(dubbingJobs.id, id));
  }

  async createFileDetails(fileDetailsData: InsertFileDetails): Promise<FileDetails> {
    const [details] = await db
      .insert(fileDetails)
      .values(fileDetailsData)
      .returning();
    return details;
  }

  async getFileDetailsByVideoId(videoId: number): Promise<FileDetails | undefined> {
    const [details] = await db
      .select()
      .from(fileDetails)
      .where(eq(fileDetails.videoId, videoId));
    return details || undefined;
  }
}

export class MemStorage implements IStorage {
  private videos: Map<number, Video> = new Map();
  private transcriptions: Map<number, Transcription> = new Map();
  private translations: Map<number, Translation> = new Map();
  private dubbingJobs: Map<number, DubbingJob> = new Map();
  private fileDetails: Map<number, FileDetails> = new Map();
  
  private currentVideoId = 1;
  private currentTranscriptionId = 1;
  private currentTranslationId = 1;
  private currentDubbingJobId = 1;
  private currentFileDetailsId = 1;

  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const video: Video = {
      ...insertVideo,
      id: this.currentVideoId++,
      duration: insertVideo.duration || null,
      status: insertVideo.status || "uploaded",
      sourceLanguage: insertVideo.sourceLanguage || null,
      sourceLanguageConfidence: insertVideo.sourceLanguageConfidence || null,
      bengaliConfirmed: insertVideo.bengaliConfirmed || false,
      speakerCount: insertVideo.speakerCount || 1,
      selectedServices: insertVideo.selectedServices || null,
      selectedModels: insertVideo.selectedModels || null,
      targetLanguages: insertVideo.targetLanguages || null,
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

  async updateVideoBengaliConfirmed(id: number, confirmed: boolean): Promise<void> {
    const video = this.videos.get(id);
    if (video) {
      video.bengaliConfirmed = confirmed;
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

  async updateVideoSourceLanguage(id: number, language: string, confidence: number): Promise<void> {
    const video = this.videos.get(id);
    if (video) {
      video.sourceLanguage = language;
      video.sourceLanguageConfidence = confidence;
      this.videos.set(id, video);
    }
  }

  async updateVideoServices(id: number, services: string[], models: string[], targetLanguages: string[]): Promise<void> {
    const video = this.videos.get(id);
    if (video) {
      video.selectedServices = JSON.stringify(services);
      video.selectedModels = JSON.stringify(models);
      video.targetLanguages = JSON.stringify(targetLanguages);
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
      speakerId: insertTranscription.speakerId || null,
      speakerName: insertTranscription.speakerName || null,
      modelSource: insertTranscription.modelSource || null,
      alternativeText: insertTranscription.alternativeText || null,
      alternativeModelSource: insertTranscription.alternativeModelSource || null,
      isAlternativeSelected: insertTranscription.isAlternativeSelected || false,
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

  async deleteTranscription(id: number): Promise<void> {
    // First delete all associated translations
    const translationsToDelete = Array.from(this.translations.values())
      .filter(t => t.transcriptionId === id);
    translationsToDelete.forEach(t => this.translations.delete(t.id));
    
    // Then delete the transcription
    this.transcriptions.delete(id);
  }

  async switchAlternativeTranscription(id: number): Promise<void> {
    const transcription = this.transcriptions.get(id);
    if (!transcription || !transcription.alternativeText) {
      throw new Error("No alternative transcription available");
    }
    
    // Swap primary and alternative text
    const currentText = transcription.text;
    const currentModelSource = transcription.modelSource;
    
    transcription.text = transcription.alternativeText;
    transcription.modelSource = transcription.alternativeModelSource;
    transcription.alternativeText = currentText;
    transcription.alternativeModelSource = currentModelSource;
    transcription.isAlternativeSelected = !transcription.isAlternativeSelected;
    
    this.transcriptions.set(id, transcription);
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

  async updateTranslation(id: number, text: string, confidence?: number): Promise<void> {
    const translation = this.translations.get(id);
    if (translation) {
      translation.translatedText = text;
      if (confidence !== undefined) translation.confidence = confidence;
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
  
  async getDubbingJob(id: number): Promise<DubbingJob | undefined> {
    return this.dubbingJobs.get(id);
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

  async createFileDetails(fileDetailsData: InsertFileDetails): Promise<FileDetails> {
    const details: FileDetails = {
      ...fileDetailsData,
      id: this.currentFileDetailsId++,
      videoId: fileDetailsData.videoId || null,
      codec: fileDetailsData.codec || null,
      resolution: fileDetailsData.resolution || null,
      fps: fileDetailsData.fps || null,
      bitrate: fileDetailsData.bitrate || null,
      audioCodec: fileDetailsData.audioCodec || null,
      audioSampleRate: fileDetailsData.audioSampleRate || null,
      audioChannels: fileDetailsData.audioChannels || null,
      extractedAudioPath: fileDetailsData.extractedAudioPath || null,
      thumbnailPath: fileDetailsData.thumbnailPath || null,
      metadataJson: fileDetailsData.metadataJson || null,
      createdAt: new Date(),
    };
    this.fileDetails.set(details.id, details);
    return details;
  }

  async getFileDetailsByVideoId(videoId: number): Promise<FileDetails | undefined> {
    return Array.from(this.fileDetails.values()).find(d => d.videoId === videoId) || undefined;
  }
}

export const storage = new DatabaseStorage();
