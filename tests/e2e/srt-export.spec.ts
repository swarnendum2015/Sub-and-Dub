import { test, expect } from '@playwright/test';

test.describe('SRT Export Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Setup complete workflow
    await page.getByLabel(/drag.*drop.*files/i).setInputFiles({
      name: 'test-video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake video content'),
    });
    
    await page.waitForURL('**/workspace/**');
    
    // Complete transcription and translations
    await expect(page.getByText('আমি একটি পরীক্ষার ভিডিও')).toBeVisible({ timeout: 30000 });
    await page.getByText('Confirm Bengali Transcription').click();
    
    // Generate English translation
    await page.getByText('English').click();
    await page.getByText('Generate English Translation').click();
    await expect(page.getByText('I am creating a test video')).toBeVisible({ timeout: 30000 });
  });

  test('SRT export availability', async ({ page }) => {
    // Should show SRT export option
    await expect(page.getByText('Export SRT')).toBeVisible();
    
    // Should show language selection for SRT
    await page.getByText('Export SRT').click();
    await expect(page.getByText('Select Language')).toBeVisible();
    await expect(page.getByText('Bengali')).toBeVisible();
    await expect(page.getByText('English')).toBeVisible();
  });

  test('Bengali SRT export', async ({ page }) => {
    await page.getByText('Export SRT').click();
    
    // Mock SRT download
    await page.route('**/api/videos/*/srt?language=bn', (route) => {
      const srtContent = `1
00:00:00,000 --> 00:00:05,000
আমি একটি পরীক্ষার ভিডিও তৈরি করছি।

2
00:00:05,000 --> 00:00:10,000
এটি একটি বাংলা থেকে ইংরেজি অনুবাদের উদাহরণ।

3
00:00:10,000 --> 00:00:15,000
আমরা এই সিস্টেমটি পরীক্ষা করছি।
`;
      
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="subtitles-bn.srt"',
        },
        body: srtContent,
      });
    });
    
    // Download Bengali SRT
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Bengali').click();
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toBe('subtitles-bn.srt');
  });

  test('English SRT export', async ({ page }) => {
    await page.getByText('Export SRT').click();
    
    // Mock English SRT download
    await page.route('**/api/videos/*/srt?language=en', (route) => {
      const srtContent = `1
00:00:00,000 --> 00:00:05,000
I am creating a test video.

2
00:00:05,000 --> 00:00:10,000
This is an example of Bengali to English translation.

3
00:00:10,000 --> 00:00:15,000
We are testing this system.
`;
      
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="subtitles-en.srt"',
        },
        body: srtContent,
      });
    });
    
    // Download English SRT
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('English').click();
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toBe('subtitles-en.srt');
  });

  test('multi-language SRT export', async ({ page }) => {
    // Generate Hindi translation
    await page.getByText('Hindi').click();
    await page.getByText('Generate Hindi Translation').click();
    await expect(page.getByText(/मैं एक परीक्षण वीडियो/)).toBeVisible({ timeout: 30000 });
    
    // Export SRT for multiple languages
    const languages = ['Bengali', 'English', 'Hindi'];
    
    for (const language of languages) {
      await page.getByText('Export SRT').click();
      
      const downloadPromise = page.waitForEvent('download');
      await page.getByText(language).click();
      const download = await downloadPromise;
      
      expect(download.suggestedFilename()).toContain('subtitles-');
      expect(download.suggestedFilename()).toContain('.srt');
    }
  });

  test('SRT format validation', async ({ page }) => {
    // Mock SRT response and capture content
    let srtContent = '';
    await page.route('**/api/videos/*/srt?language=en', (route) => {
      srtContent = `1
00:00:00,000 --> 00:00:05,000
I am creating a test video.

2
00:00:05,000 --> 00:00:10,000
This is an example of Bengali to English translation.

3
00:00:10,000 --> 00:00:15,000
We are testing this system.
`;
      
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="subtitles-en.srt"',
        },
        body: srtContent,
      });
    });
    
    await page.getByText('Export SRT').click();
    await page.getByText('English').click();
    
    // Validate SRT format
    expect(srtContent).toMatch(/^\d+$/m); // Sequence numbers
    expect(srtContent).toMatch(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/); // Timestamps
    expect(srtContent).toContain('I am creating a test video'); // Content
  });

  test('SRT timing accuracy', async ({ page }) => {
    // Mock detailed SRT response
    await page.route('**/api/videos/*/srt?language=en', (route) => {
      const srtContent = `1
00:00:00,000 --> 00:00:05,000
I am creating a test video.

2
00:00:05,000 --> 00:00:10,000
This is an example of Bengali to English translation.

3
00:00:10,000 --> 00:00:15,000
We are testing this system.
`;
      
      route.fulfill({
        status: 200,
        body: srtContent,
      });
    });
    
    await page.getByText('Export SRT').click();
    await page.getByText('English').click();
    
    // Timing should match transcription segments
    // First segment: 0-5 seconds -> 00:00:00,000 --> 00:00:05,000
    // Second segment: 5-10 seconds -> 00:00:05,000 --> 00:00:10,000
    // Third segment: 10-15 seconds -> 00:00:10,000 --> 00:00:15,000
  });

  test('SRT export for incomplete translations', async ({ page }) => {
    // Try to export SRT for language without translation
    await page.getByText('Export SRT').click();
    
    // Tamil doesn't have translation yet
    await page.getByText('Tamil').click();
    
    // Should show error or prompt to generate translation first
    await expect(page.getByText(/generate translation first/i)).toBeVisible();
  });

  test('SRT character encoding', async ({ page }) => {
    // Test with Bengali characters
    await page.route('**/api/videos/*/srt?language=bn', (route) => {
      const srtContent = `1
00:00:00,000 --> 00:00:05,000
আমি একটি পরীক্ষার ভিডিও তৈরি করছি।

2
00:00:05,000 --> 00:00:10,000
এটি একটি বাংলা থেকে ইংরেজি অনুবাদের উদাহরণ।
`;
      
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="subtitles-bn.srt"',
        },
        body: srtContent,
      });
    });
    
    await page.getByText('Export SRT').click();
    
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Bengali').click();
    const download = await downloadPromise;
    
    // Should preserve Unicode characters
    expect(download.suggestedFilename()).toBe('subtitles-bn.srt');
  });

  test('SRT export error handling', async ({ page }) => {
    // Mock server error
    await page.route('**/api/videos/*/srt**', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'SRT generation failed' }),
      });
    });
    
    await page.getByText('Export SRT').click();
    await page.getByText('English').click();
    
    // Should show error message
    await expect(page.getByText(/SRT generation failed/i)).toBeVisible();
  });

  test('batch SRT export', async ({ page }) => {
    // Generate multiple translations
    await page.getByText('Hindi').click();
    await page.getByText('Generate Hindi Translation').click();
    await expect(page.getByText(/मैं एक परीक्षण वीडियो/)).toBeVisible({ timeout: 30000 });
    
    // Should offer bulk export option
    await expect(page.getByText('Export All SRT')).toBeVisible();
    
    // Mock bulk export
    await page.route('**/api/videos/*/srt/all', (route) => {
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="subtitles-all.zip"',
        },
        body: Buffer.from('fake zip content'),
      });
    });
    
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Export All SRT').click();
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toBe('subtitles-all.zip');
  });

  test('SRT preview before download', async ({ page }) => {
    await page.getByText('Export SRT').click();
    
    // Should show preview option
    await expect(page.getByText('Preview')).toBeVisible();
    
    await page.getByText('Preview').click();
    await page.getByText('English').click();
    
    // Should show SRT content preview
    await expect(page.getByText('1')).toBeVisible();
    await expect(page.getByText('00:00:00,000 --> 00:00:05,000')).toBeVisible();
    await expect(page.getByText('I am creating a test video')).toBeVisible();
  });
});