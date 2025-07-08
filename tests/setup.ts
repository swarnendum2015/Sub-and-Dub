import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

// Make React available globally
global.React = React;

// Mock environment variables
vi.mock('import.meta', () => ({
  env: {
    VITE_API_URL: 'http://localhost:5000',
  },
}));

// Mock fetch for API calls
global.fetch = vi.fn();

// Mock file uploads
global.File = class MockFile {
  constructor(public chunks: any[], public filename: string, public options: any = {}) {}
  get name() { return this.filename; }
  get size() { return this.chunks.reduce((acc, chunk) => acc + chunk.length, 0); }
  get type() { return this.options.type || 'application/octet-stream'; }
};

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-object-url');
global.URL.revokeObjectURL = vi.fn();

// Suppress console warnings in tests
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if (args[0]?.includes?.('React Router')) return;
  originalConsoleWarn(...args);
};