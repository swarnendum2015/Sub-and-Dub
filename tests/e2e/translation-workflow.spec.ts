import { test, expect } from '@playwright/test';

test.describe('Translation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Upload and process video
    await page.getByLabel(/drag.*drop.*files/i).setInputFiles({
      name: 'test-video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake video content'),
    });
    
    await page.waitForURL('**/workspace/**');
    
    // Wait for transcription and confirm Bengali
    await expect(page.getByText('আমি একটি পরীক্ষার ভিডিও')).toBeVisible({ timeout: 30000 });
    await page.getByText('Confirm Bengali Transcription').click();
    await expect(page.getByText('Bengali Confirmed')).toBeVisible();
  });

  test('English translation generation', async ({ page }) => {
    // Switch to English tab
    await page.getByText('English').click();
    
    // Should show translation generation option
    await expect(page.getByText('Generate English Translation')).toBeVisible();
    
    // Start translation
    await page.getByText('Generate English Translation').click();
    
    // Should show processing state
    await expect(page.getByText(/translating/i)).toBeVisible();
    
    // Wait for translation to complete
    await expect(page.getByText('I am creating a test video')).toBeVisible({ timeout: 30000 });
    
    // Should show completion badge
    await expect(page.getByText('English').locator('..').getByRole('img')).toBeVisible();
  });

  test('multi-language translation', async ({ page }) => {
    // Test Hindi translation
    await page.getByText('Hindi').click();
    await page.getByText('Generate Hindi Translation').click();
    await expect(page.getByText(/मैं एक परीक्षण वीडियो/)).toBeVisible({ timeout: 30000 });
    
    // Test Tamil translation
    await page.getByText('Tamil').click();
    await page.getByText('Generate Tamil Translation').click();
    await expect(page.getByText(/நான் ஒரு சோதனை வீடியோ/)).toBeVisible({ timeout: 30000 });
    
    // Test Telugu translation
    await page.getByText('Telugu').click();
    await page.getByText('Generate Telugu Translation').click();
    await expect(page.getByText(/నేను ఒక పరీక్ష వీడియో/)).toBeVisible({ timeout: 30000 });
    
    // Test Malayalam translation
    await page.getByText('Malayalam').click();
    await page.getByText('Generate Malayalam Translation').click();
    await expect(page.getByText(/ഞാൻ ഒരു ടെസ്റ്റ് വീഡിയോ/)).toBeVisible({ timeout: 30000 });
  });

  test('translation editing', async ({ page }) => {
    // Generate English translation first
    await page.getByText('English').click();
    await page.getByText('Generate English Translation').click();
    await expect(page.getByText('I am creating a test video')).toBeVisible({ timeout: 30000 });
    
    // Edit translation
    const translationCard = page.getByText('I am creating a test video').locator('..');
    await translationCard.hover();
    await page.getByTitle('Edit text').click();
    
    const textarea = page.getByRole('textbox');
    await textarea.fill('Updated English translation');
    await page.getByRole('button', { name: /check/i }).click();
    
    // Should show updated text
    await expect(page.getByText('Updated English translation')).toBeVisible();
  });

  test('translation model selection', async ({ page }) => {
    await page.getByText('English').click();
    
    // Should show translation model dropdown
    await expect(page.getByText('Translation Model')).toBeVisible();
    
    // Select different model
    await page.getByRole('combobox', { name: /translation model/i }).click();
    await page.getByText('OpenAI GPT-4').click();
    
    // Generate translation with selected model
    await page.getByText('Generate English Translation').click();
    await expect(page.getByText('I am creating a test video')).toBeVisible({ timeout: 30000 });
  });

  test('batch translation performance', async ({ page }) => {
    // Switch to English tab
    await page.getByText('English').click();
    
    // Start translation and measure time
    const startTime = Date.now();
    await page.getByText('Generate English Translation').click();
    
    // Wait for all segments to be translated
    await expect(page.getByText('I am creating a test video')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('This is an example of Bengali')).toBeVisible();
    await expect(page.getByText('We are testing this system')).toBeVisible();
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Should complete within reasonable time (batch should be faster than individual)
    expect(duration).toBeLessThan(15000); // 15 seconds max
  });

  test('translation confidence display', async ({ page }) => {
    await page.getByText('English').click();
    await page.getByText('Generate English Translation').click();
    await expect(page.getByText('I am creating a test video')).toBeVisible({ timeout: 30000 });
    
    // Should show confidence scores for translations
    await expect(page.getByText(/9[0-9]%/)).toBeVisible(); // High confidence
  });

  test('retranslation functionality', async ({ page }) => {
    // Generate initial translation
    await page.getByText('English').click();
    await page.getByText('Generate English Translation').click();
    await expect(page.getByText('I am creating a test video')).toBeVisible({ timeout: 30000 });
    
    // Hover and retranslate specific segment
    const translationCard = page.getByText('I am creating a test video').locator('..');
    await translationCard.hover();
    await page.getByTitle('Re-verify translation').click();
    
    // Should show refresh indicator
    await expect(page.getByTitle('Re-verify translation').locator('svg')).toHaveClass(/animate-spin/);
    
    // Translation should update
    await expect(page.getByText('I am creating a test video')).toBeVisible();
  });

  test('translation cache invalidation', async ({ page }) => {
    // Generate English translation
    await page.getByText('English').click();
    await page.getByText('Generate English Translation').click();
    await expect(page.getByText('I am creating a test video')).toBeVisible({ timeout: 30000 });
    
    // Edit Bengali transcription
    await page.getByText('Bengali').click();
    const bengaliCard = page.getByText('আমি একটি পরীক্ষার ভিডিও').locator('..');
    await bengaliCard.hover();
    await page.getByTitle('Edit text').click();
    
    const textarea = page.getByRole('textbox');
    await textarea.fill('আপডেট করা বাংলা টেক্সট');
    await page.getByRole('button', { name: /check/i }).click();
    
    // Switch back to English - translations should be invalidated
    await page.getByText('English').click();
    await expect(page.getByText('Generate English Translation')).toBeVisible();
  });

  test('translation progress tracking', async ({ page }) => {
    // Start multiple translations
    const languages = ['English', 'Hindi', 'Tamil'];
    
    for (const language of languages) {
      await page.getByText(language).click();
      await page.getByText(`Generate ${language} Translation`).click();
      
      // Should show progress indicator
      await expect(page.getByText(/translating/i)).toBeVisible();
    }
    
    // All should eventually complete
    for (const language of languages) {
      await page.getByText(language).click();
      await expect(page.locator('.translation-content')).toBeVisible({ timeout: 30000 });
    }
  });

  test('translation error handling', async ({ page }) => {
    // Mock API error
    await page.route('**/api/videos/*/translate', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Translation failed' }),
      });
    });
    
    await page.getByText('English').click();
    await page.getByText('Generate English Translation').click();
    
    // Should show error message
    await expect(page.getByText(/translation failed/i)).toBeVisible();
  });

  test('partial translation completion', async ({ page }) => {
    // Mock partial translation response
    await page.route('**/api/videos/*/translate', (route) => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          message: 'Partial translation completed',
          translations: [
            { transcriptionId: 1, text: 'Translated segment 1' }
            // Missing segments 2 and 3
          ]
        }),
      });
    });
    
    await page.getByText('English').click();
    await page.getByText('Generate English Translation').click();
    
    // Should show partial completion
    await expect(page.getByText('Complete the remaining English translations')).toBeVisible();
    
    // Should allow completing remaining translations
    await page.getByText('Complete English Translation').click();
  });

  test('original Bengali text reference', async ({ page }) => {
    // Generate English translation
    await page.getByText('English').click();
    await page.getByText('Generate English Translation').click();
    await expect(page.getByText('I am creating a test video')).toBeVisible({ timeout: 30000 });
    
    // Should show original Bengali text as reference
    await expect(page.getByText('Bengali: আমি একটি পরীক্ষার ভিডিও')).toBeVisible();
  });
});