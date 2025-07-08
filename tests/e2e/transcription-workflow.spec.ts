import { test, expect } from '@playwright/test';

test.describe('Transcription Workflow', () => {
  // Setup: Upload a video first
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Upload test video
    await page.getByLabel(/drag.*drop.*files/i).setInputFiles({
      name: 'test-video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake video content'),
    });
    
    // Wait for navigation to workspace
    await page.waitForURL('**/workspace/**');
  });

  test('Bengali transcription processing and confirmation', async ({ page }) => {
    // Should be on Bengali tab by default
    await expect(page.getByText('Bengali')).toHaveAttribute('data-state', 'active');
    
    // Should show processing state initially
    await expect(page.getByText(/processing/i)).toBeVisible();
    
    // Wait for transcription to complete
    await expect(page.getByText('আমি একটি পরীক্ষার ভিডিও')).toBeVisible({ timeout: 30000 });
    
    // Should show confidence scores
    await expect(page.getByText(/\d+%/)).toBeVisible();
    
    // Should show speaker identification
    await expect(page.getByText(/Speaker \d+/)).toBeVisible();
    
    // Confirm Bengali transcription
    await page.getByText('Confirm Bengali Transcription').click();
    
    // Should show confirmed badge
    await expect(page.getByText('Bengali Confirmed')).toBeVisible();
  });

  test('transcription editing', async ({ page }) => {
    // Wait for transcriptions to load
    await expect(page.getByText('আমি একটি পরীক্ষার ভিডিও')).toBeVisible({ timeout: 30000 });
    
    // Hover over transcription to show edit button
    const transcriptionCard = page.getByText('আমি একটি পরীক্ষার ভিডিও').locator('..');
    await transcriptionCard.hover();
    
    // Click edit button
    await page.getByTitle('Edit text').click();
    
    // Edit text
    const textarea = page.getByRole('textbox');
    await textarea.fill('আপডেট করা বাংলা টেক্সট');
    
    // Save changes
    await page.getByRole('button', { name: /check/i }).click();
    
    // Should show updated text
    await expect(page.getByText('আপডেট করা বাংলা টেক্সট')).toBeVisible();
    
    // Should invalidate Bengali confirmed status
    await expect(page.getByText('Bengali Confirmed')).not.toBeVisible();
  });

  test('multi-model transcription selection', async ({ page }) => {
    // Should show model selection dropdown
    await expect(page.getByText('Transcription Model')).toBeVisible();
    
    // Select different model
    await page.getByRole('combobox', { name: /transcription model/i }).click();
    await page.getByText('OpenAI Whisper Only').click();
    
    // Content should refresh
    await expect(page.getByText(/processing/i)).toBeVisible();
    await expect(page.getByText('আমি একটি পরীক্ষার ভিডিও')).toBeVisible({ timeout: 30000 });
  });

  test('timestamp navigation', async ({ page }) => {
    // Wait for transcriptions
    await expect(page.getByText('আমি একটি পরীক্ষার ভিডিও')).toBeVisible({ timeout: 30000 });
    
    // Click on transcription segment
    const firstSegment = page.getByText('0:00 - 0:05').locator('..');
    await firstSegment.click();
    
    // Video should seek to that time
    const video = page.locator('video');
    await expect(video).toHaveAttribute('currentTime', /^[0-4]/); // Should be within first 5 seconds
  });

  test('current segment highlighting', async ({ page }) => {
    // Wait for transcriptions
    await expect(page.getByText('আমি একটি পরীক্ষার ভিডিও')).toBeVisible({ timeout: 30000 });
    
    // Play video
    await page.locator('video').click();
    
    // Current segment should be highlighted
    const currentSegment = page.locator('[class*="border-primary"]').first();
    await expect(currentSegment).toBeVisible();
  });

  test('speaker identification display', async ({ page }) => {
    // Wait for transcriptions
    await expect(page.getByText('আমি একটি পরীক্ষার ভিডিও')).toBeVisible({ timeout: 30000 });
    
    // Should show speaker badges
    await expect(page.getByText('Speaker 1')).toBeVisible();
    await expect(page.getByText('Speaker 2')).toBeVisible();
    
    // Should show auto-detected speaker count
    await expect(page.getByText(/Auto-detected: \d+/)).toBeVisible();
  });

  test('transcription confidence scoring', async ({ page }) => {
    // Wait for transcriptions
    await expect(page.getByText('আমি একটি পরীক্ষার ভিডিও')).toBeVisible({ timeout: 30000 });
    
    // Should show confidence badges with appropriate colors
    const highConfidence = page.getByText('95%');
    await expect(highConfidence).toBeVisible();
    await expect(highConfidence).toHaveClass(/bg-green/);
    
    const mediumConfidence = page.getByText(/[7-8]\d%/);
    if (await mediumConfidence.isVisible()) {
      await expect(mediumConfidence).toHaveClass(/bg-yellow/);
    }
  });

  test('transcription model caching and refresh', async ({ page }) => {
    // Wait for initial transcription
    await expect(page.getByText('আমি একটি পরীক্ষার ভিডিও')).toBeVisible({ timeout: 30000 });
    
    // Change model
    await page.getByRole('combobox', { name: /transcription model/i }).click();
    await page.getByText('Gemini 2.5 Pro Only').click();
    
    // Content should refresh immediately
    await expect(page.getByText(/processing/i)).toBeVisible();
    
    // Switch back to combined
    await page.getByRole('combobox', { name: /transcription model/i }).click();
    await page.getByText('Combined (Recommended)').click();
    
    // Should show combined results
    await expect(page.getByText('আমি একটি পরীক্ষার ভিডিও')).toBeVisible({ timeout: 30000 });
  });

  test('transcription error handling', async ({ page }) => {
    // Mock API error
    await page.route('**/api/transcriptions/**', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Transcription failed' }),
      });
    });
    
    // Trigger retranscription
    await page.getByText('Retry Transcription').click();
    
    // Should show error message
    await expect(page.getByText(/transcription failed/i)).toBeVisible();
  });
});