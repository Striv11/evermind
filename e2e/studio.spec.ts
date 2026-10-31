import { expect, test, type Page } from '@playwright/test';

async function createVault(page: Page) {
  await page.goto('/#/vault');
  await page.getByTestId('passphrase').fill('correct horse battery');
  await page.getByTestId('passphrase2').fill('correct horse battery');
  await page.getByTestId('vault-submit').click();
  await page.getByTestId('open-studio').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Studio');
}

test('studio requires an unlocked vault', async ({ page }) => {
  await page.goto('/#/studio');
  await expect(page.getByText('Unlock your vault first')).toBeVisible();
});

test('studio: empty state, honest abstention, consent gate', async ({ page }) => {
  await createVault(page);
  await expect(page.getByText('Nothing yet.')).toBeVisible();
  await page.getByTestId('ask').fill('What did you study?');
  await page.getByTestId('ask').press('Enter');
  await expect(page.getByTestId('reply')).toContainText("I don't remember");
  await expect(page.getByTestId('reply')).toContainText('AI reconstruction');
});

/**
 * Full pipeline on real speech: decode -> on-device Whisper -> emotions/themes ->
 * encrypted vault -> twin answer. Downloads the speech model, so it only runs
 * when STORY_WAV points at a recording whose content matches the assertions.
 */
test('real speech becomes sorted memories the twin can recall', async ({ page }) => {
  const wav = process.env['STORY_WAV'];
  test.skip(!wav, 'set STORY_WAV to run the full speech pipeline');
  test.setTimeout(600_000);
  await createVault(page);
  await page.getByLabel('Birth year').fill('2001');
  await page.getByTestId('audio-files').setInputFiles(wav!);
  await expect(page.getByTestId('queue')).toContainText('Saved.', { timeout: 540_000 });
  const memories = page.getByTestId('memories').locator('li');
  expect(await memories.count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('memories')).toContainText(/grandmother/i);
  await expect(page.getByRole('group', { name: 'Filter by life area' })).toContainText('Family');
  await page.getByTestId('ask').fill('Tell me about your grandmother');
  await page.getByTestId('ask').press('Enter');
  await expect(page.getByTestId('reply')).toContainText(/parathas|kitchen|kindness/i);
  await page.screenshot({ path: 'test-results/studio-real-speech.png', fullPage: true });
});
