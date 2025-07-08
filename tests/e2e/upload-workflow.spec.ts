import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Video Upload Workflow', () => {
  test('complete video upload and processing workflow', async ({ page }) => {
    // Navigate to landing page
    await page.goto('/');
    
    // Verify page loads
    await expect(page.getByText('Video Dubbing & Translation')).toBeVisible();
    await expect(page.getByText('Upload Video')).toBeVisible();

    // Check upload tabs
    await expect(page.getByText('File Upload')).toBeVisible();
    await expect(page.getByText('S3 Bucket')).toBeVisible();
    await expect(page.getByText('YouTube URL')).toBeVisible();

    // Test file upload
    const fileChooser = page.getByLabel(/drag.*drop.*files/i);
    
    // Create a test file (small video file for testing)
    await fileChooser.setInputFiles({
      name: 'test-video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake video content'),
    });

    // Verify file appears in upload area
    await expect(page.getByText('test-video.mp4')).toBeVisible();

    // Select transcription models
    await page.getByLabel('OpenAI Whisper').check();
    await page.getByLabel('Gemini 2.5 Pro').check();

    // Wait for upload to complete and navigation to workspace
    await page.waitForURL('**/workspace/**');
    
    // Verify workspace page loads
    await expect(page.getByText('Video Player')).toBeVisible();
    await expect(page.getByText('Transcription & Translation')).toBeVisible();
  });

  test('S3 bucket upload', async ({ page }) => {
    await page.goto('/');
    
    // Switch to S3 tab
    await page.getByText('S3 Bucket').click();
    
    // Enter S3 URL
    await page.getByPlaceholder('S3 bucket URL').fill('https://test-bucket.s3.amazonaws.com/test-video.mp4');
    
    // Click upload
    await page.getByText('Upload from S3').click();
    
    // Should show processing state
    await expect(page.getByText(/processing/i)).toBeVisible();
  });

  test('YouTube URL upload', async ({ page }) => {
    await page.goto('/');
    
    // Switch to YouTube tab
    await page.getByText('YouTube URL').click();
    
    // Enter YouTube URL
    await page.getByPlaceholder('YouTube video URL').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    
    // Click upload
    await page.getByText('Upload from YouTube').click();
    
    // Should show processing state
    await expect(page.getByText(/processing/i)).toBeVisible();
  });

  test('file validation', async ({ page }) => {
    await page.goto('/');
    
    // Try uploading invalid file type
    await page.getByLabel(/drag.*drop.*files/i).setInputFiles({
      name: 'document.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('not a video'),
    });
    
    // Should show error
    await expect(page.getByText(/invalid file type/i)).toBeVisible();
  });

  test('file size validation', async ({ page }) => {
    await page.goto('/');
    
    // Try uploading oversized file (simulate large file)
    await page.getByLabel(/drag.*drop.*files/i).setInputFiles({
      name: 'large-video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.alloc(600 * 1024 * 1024), // 600MB
    });
    
    // Should show error
    await expect(page.getByText(/file too large/i)).toBeVisible();
  });

  test('recent videos display', async ({ page }) => {
    await page.goto('/');
    
    // Should show recent videos section
    await expect(page.getByText('Recent Videos')).toBeVisible();
    
    // If there are recent videos, they should be clickable
    const recentVideo = page.locator('[data-testid="recent-video"]').first();
    if (await recentVideo.isVisible()) {
      await recentVideo.click();
      await page.waitForURL('**/workspace/**');
    }
  });

  test('model selection persistence', async ({ page }) => {
    await page.goto('/');
    
    // Select models
    await page.getByLabel('OpenAI Whisper').check();
    await page.getByLabel('ElevenLabs STT').check();
    
    // Verify selections persist
    await expect(page.getByLabel('OpenAI Whisper')).toBeChecked();
    await expect(page.getByLabel('ElevenLabs STT')).toBeChecked();
    await expect(page.getByLabel('Gemini 2.5 Pro')).not.toBeChecked();
  });

  test('upload progress indication', async ({ page }) => {
    await page.goto('/');
    
    // Start upload
    await page.getByLabel(/drag.*drop.*files/i).setInputFiles({
      name: 'test-video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake video content'),
    });
    
    // Should show progress indicators
    await expect(page.getByText(/uploading/i)).toBeVisible();
    
    // Progress should eventually complete
    await expect(page.getByText(/upload.*complete/i)).toBeVisible({ timeout: 10000 });
  });
});