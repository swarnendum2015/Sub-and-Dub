import { apiRequest } from "./queryClient";

export const api = {
  videos: {
    upload: async (file: File) => {
      const formData = new FormData();
      formData.append('video', file);
      
      const response = await fetch('/api/videos/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      return response.json();
    },
    
    getAll: async () => {
      const response = await apiRequest('GET', '/api/videos');
      return response.json();
    },
    
    getById: async (id: string) => {
      const response = await apiRequest('GET', `/api/videos/${id}`);
      return response.json();
    },
    
    getTranscriptions: async (id: string) => {
      const response = await apiRequest('GET', `/api/videos/${id}/transcriptions`);
      return response.json();
    },
    
    getDubbingJobs: async (id: string) => {
      const response = await apiRequest('GET', `/api/videos/${id}/dubbing`);
      return response.json();
    },
  },
  
  transcriptions: {
    update: async (id: number, text: string) => {
      const response = await apiRequest('PATCH', `/api/transcriptions/${id}`, { text });
      return response.json();
    },
    
    getTranslations: async (id: number) => {
      const response = await apiRequest('GET', `/api/transcriptions/${id}/translations`);
      return response.json();
    },
  },
  
  translations: {
    update: async (id: number, text: string) => {
      const response = await apiRequest('PATCH', `/api/translations/${id}`, { text });
      return response.json();
    },
  },
  
  dubbing: {
    generate: async (videoId: string, language: string) => {
      const response = await apiRequest('POST', `/api/videos/${videoId}/dubbing`, { language });
      return response.json();
    },
  },
};
