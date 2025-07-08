import { test, expect } from '@playwright/test';

test.describe('Dubbing Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Upload and setup video
    await page.getByLabel(/drag.*drop.*files/i).setInputFiles({
      name: 'test-video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake video content'),
    });
    
    await page.waitForURL('**/workspace/**');
    
    // Complete transcription and translation setup
    await expect(page.getByText('আমি একটি পরীক্ষার ভিডিও')).toBeVisible({ timeout: 30000 });
    await page.getByText('Confirm Bengali Transcription').click();
    await expect(page.getByText('Bengali Confirmed')).toBeVisible();
    
    // Generate English translation
    await page.getByText('English').click();
    await page.getByText('Generate English Translation').click();
    await expect(page.getByText('I am creating a test video')).toBeVisible({ timeout: 30000 });
  });

  test('dubbing section visibility and independence', async ({ page }) => {
    // Should show dubbing section on non-Bengali tabs
    await page.getByText('English').click();
    await expect(page.getByText('Audio Dubbing - English')).toBeVisible();
    await expect(page.getByText('Uses Original Video Audio')).toBeVisible();
    
    // Should not show dubbing section on Bengali tab
    await page.getByText('Bengali').click();
    await expect(page.getByText('Audio Dubbing')).not.toBeVisible();
  });

  test('speaker count selection', async ({ page }) => {
    await page.getByText('English').click();
    
    // Should show speaker selection
    await expect(page.getByText('Speakers:')).toBeVisible();
    await expect(page.getByDisplayValue('1 Speaker')).toBeVisible();
    
    // Should show auto-detected count
    await expect(page.getByText(/Auto-detected: \d+/)).toBeVisible();
    
    // Change speaker count
    await page.getByRole('combobox', { name: /speakers/i }).click();
    await page.getByText('2 Speakers').click();
    
    // Should show voice selections for each speaker
    await expect(page.getByText('Voice 1:')).toBeVisible();
    await expect(page.getByText('Voice 2:')).toBeVisible();
  });

  test('voice selection for different languages', async ({ page }) => {
    // Test English voices
    await page.getByText('English').click();
    await page.getByRole('combobox', { name: /voice 1/i }).click();
    
    await expect(page.getByText('Rachel (Female, American)')).toBeVisible();
    await expect(page.getByText('Antoni (Male, American)')).toBeVisible();
    await expect(page.getByText('Adam (Male, American)')).toBeVisible();
    
    // Test Hindi voices (should include Indian accents)
    await page.getByText('Hindi').click();
    await page.getByRole('combobox', { name: /voice 1/i }).click();
    
    await expect(page.getByText('Charlotte (Female, Indian)')).toBeVisible();
    await expect(page.getByText('Charlie (Male, Indian)')).toBeVisible();
  });

  test('dubbing job creation', async ({ page }) => {
    await page.getByText('English').click();
    
    // Select voice
    await page.getByRole('combobox', { name: /voice 1/i }).click();
    await page.getByText('Rachel (Female, American)').click();
    
    // Start dubbing
    await page.getByText('Generate Audio Dubbing (1 Speaker)').click();
    
    // Should show processing state
    await expect(page.getByText('Processing English dubbing with ElevenLabs Studio')).toBeVisible();
  });

  test('multi-speaker dubbing setup', async ({ page }) => {
    await page.getByText('English').click();
    
    // Set speaker count to 2
    await page.getByRole('combobox', { name: /speakers/i }).click();
    await page.getByText('2 Speakers').click();
    
    // Select different voices for each speaker
    await page.getByRole('combobox', { name: /voice 1/i }).click();
    await page.getByText('Rachel (Female, American)').click();
    
    await page.getByRole('combobox', { name: /voice 2/i }).click();
    await page.getByText('Antoni (Male, American)').click();
    
    // Generate dubbing
    await page.getByText('Generate Audio Dubbing (2 Speakers)').click();
    
    // Should process with multiple voices
    await expect(page.getByText('Processing English dubbing')).toBeVisible();
  });

  test('dubbing status tracking', async ({ page }) => {
    await page.getByText('English').click();
    await page.getByText('Generate Audio Dubbing (1 Speaker)').click();
    
    // Should show processing status
    await expect(page.getByText('Processing English dubbing')).toBeVisible();
    
    // Mock completion
    await page.route('**/api/dubbing-jobs**', (route) => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([{
          id: 1,
          videoId: 1,
          language: 'en',
          status: 'completed',
          audioPath: '/uploads/dubbed-en.mp3',
        }]),
      });
    });
    
    // Refresh to get updated status
    await page.reload();
    await page.getByText('English').click();
    
    // Should show completion status
    await expect(page.getByText('Dubbing completed!')).toBeVisible();
    await expect(page.getByText('Download')).toBeVisible();
  });

  test('dubbing failure handling', async ({ page }) => {
    // Mock dubbing failure
    await page.route('**/api/videos/*/dubbing', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Dubbing failed' }),
      });
    });
    
    await page.getByText('English').click();
    await page.getByText('Generate Audio Dubbing (1 Speaker)').click();
    
    // Should show error state
    await expect(page.getByText(/dubbing failed/i)).toBeVisible();
    
    // Should allow retry
    await expect(page.getByText('Retry Dubbing')).toBeVisible();
  });

  test('dubbing independence from translation', async ({ page }) => {
    await page.getByText('English').click();
    
    // Should show dubbing section even without complete translations
    await expect(page.getByText('Audio Dubbing - English')).toBeVisible();
    
    // Dubbing should work with original video audio
    await expect(page.getByText('Uses Original Video Audio')).toBeVisible();
    await expect(page.getByText(/processes the original video audio directly/)).toBeVisible();
  });

  test('multiple language dubbing', async ({ page }) => {
    const languages = ['English', 'Hindi', 'Tamil'];
    
    for (const language of languages) {
      await page.getByText(language).click();
      
      // Should show dubbing section for each language
      await expect(page.getByText(`Audio Dubbing - ${language}`)).toBeVisible();
      
      // Can start dubbing for each language
      await page.getByText(`Generate Audio Dubbing (1 Speaker)`).click();
      await expect(page.getByText(`Processing ${language} dubbing`)).toBeVisible();
    }
  });

  test('voice selection persistence', async ({ page }) => {
    await page.getByText('English').click();
    
    // Select specific voice
    await page.getByRole('combobox', { name: /voice 1/i }).click();
    await page.getByText('Antoni (Male, American)').click();
    
    // Switch to another tab and back
    await page.getByText('Hindi').click();
    await page.getByText('English').click();
    
    // Voice selection should persist
    await expect(page.getByDisplayValue('Antoni (Male, American)')).toBeVisible();
  });

  test('ElevenLabs studio integration', async ({ page }) => {
    await page.getByText('English').click();
    
    // Should indicate ElevenLabs Studio usage
    await expect(page.getByText('ElevenLabs Dubbing Studio')).toBeVisible();
    await expect(page.getByText(/authentic dubbed audio with natural timing/)).toBeVisible();
    
    // Start dubbing
    await page.getByText('Generate Audio Dubbing (1 Speaker)').click();
    await expect(page.getByText('Processing English dubbing with ElevenLabs Studio')).toBeVisible();
  });

  test('dubbing download functionality', async ({ page }) => {
    // Mock completed dubbing job
    await page.route('**/api/dubbing-jobs**', (route) => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([{
          id: 1,
          videoId: 1,
          language: 'en',
          status: 'completed',
          audioPath: '/uploads/dubbed-en.mp3',
        }]),
      });
    });
    
    await page.getByText('English').click();
    
    // Should show download button for completed dubbing
    await expect(page.getByText('Download')).toBeVisible();
    
    // Mock download response
    await page.route('**/uploads/dubbed-en.mp3', (route) => {
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': 'attachment; filename="dubbed-en.mp3"',
        },
        body: Buffer.from('fake audio content'),
      });
    });
    
    // Click download
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Download').click();
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain('dubbed-en.mp3');
  });

  test('speaker count matches transcription analysis', async ({ page }) => {
    await page.getByText('English').click();
    
    // Should show detected speaker count
    const detectedText = await page.getByText(/Auto-detected: \d+/).textContent();
    const detectedCount = parseInt(detectedText?.match(/\d+/)?.[0] || '1');
    
    // Default speaker count should match or be reasonable
    const defaultSelection = await page.getByRole('combobox', { name: /speakers/i }).inputValue();
    expect(defaultSelection).toContain(detectedCount.toString());
  });
});