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

test('capture map: interviewer question, typed answer raises coverage', async ({ page }) => {
  await createVault(page);
  await expect(page.getByTestId('coverage-overall')).toHaveText('0%');
  const question = page.getByTestId('question');
  await expect(question).not.toBeEmpty();
  const first = await question.textContent();
  await page.getByTestId('answer-type').click();
  await page
    .getByTestId('answer-text')
    .fill(
      'My grandmother raised me in Pune. She taught me that kindness is never wasted, and I miss her every day. My family is everything to me.',
    );
  await page.getByTestId('answer-save').click();
  await expect(page.getByTestId('coverage-overall')).not.toHaveText('0%');
  await expect(page.getByTestId('memories')).toContainText('grandmother raised me');
  await expect(question).not.toHaveText(first!);
  await page.getByTestId('answer-skip').click();
  await expect(page.getByTestId('profile')).toContainText('Not built yet');
});

test('studio: empty state, honest abstention, consent gate', async ({ page }) => {
  await createVault(page);
  await expect(page.getByText('Nothing yet.')).toBeVisible();
  await page.getByTestId('ask').fill('What did you study?');
  await page.getByTestId('ask').press('Enter');
  await expect(page.getByTestId('reply')).toContainText("I don't remember");
  await expect(page.getByTestId('reply')).toContainText('AI reconstruction');
});

test('fidelity loop: rate a twin reply, correction becomes a memory', async ({ page }) => {
  await createVault(page);
  await expect(page.getByTestId('fidelity')).toContainText('no ratings yet');
  await page.getByTestId('ask').fill('Should I quit my job?');
  await page.getByTestId('ask').press('Enter');
  await expect(page.getByTestId('reply')).toContainText("I don't remember");
  await page.getByTestId('rate-not-me').click();
  await page
    .getByTestId('correction')
    .fill('I would never quit without six months of savings in the bank.');
  await page.getByTestId('rate-send').click();
  await expect(page.getByTestId('verdict')).toContainText('now one of your memories');
  await expect(page.getByTestId('fidelity-overall')).toHaveText('0%');
  await expect(page.getByTestId('memories')).toContainText('six months of savings');
});

test('legacy controls: off-limits topic is refused, message stays sealed', async ({ page }) => {
  await createVault(page);
  await page.getByTestId('legacy-topic').fill('my divorce');
  await page.getByTestId('legacy-topic-add').click();
  await expect(page.getByTestId('legacy-topics')).toContainText('my divorce');
  await page.getByTestId('ask').fill('Tell me about my divorce');
  await page.getByTestId('ask').press('Enter');
  await expect(page.getByTestId('reply')).toContainText('stay private');
  await page.getByLabel('For', { exact: true }).fill('Maya');
  await page.getByLabel('Open on').fill('2999-01-01');
  await page.getByLabel('Message').fill('Be kind.');
  await page.getByRole('button', { name: 'Seal message' }).click();
  await expect(page.getByTestId('legacy-messages')).toContainText('(sealed)');
  await expect(page.getByTestId('legacy-messages')).not.toContainText('Be kind.');
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

test('import: journal files become dated memories, bad files report errors', async ({ page }) => {
  await createVault(page);
  await page.getByTestId('doc-files').setInputFiles([
    {
      name: '2015-08-01 diary.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('My grandmother taught me patience. I was so grateful.'),
    },
    { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') },
  ]);
  await expect(page.getByTestId('import-log')).toContainText('1 memories imported');
  await expect(page.getByTestId('import-log')).toContainText('only .md');
  await expect(page.getByTestId('memories')).toContainText('grandmother taught me patience');
});

test('import: WhatsApp export asks who you are and keeps only that author', async ({ page }) => {
  await createVault(page);
  const chat = [
    '[12/03/2019, 10:15:32] Anna: My mother taught me to bake bread when I was eight years old and I loved it.',
    '[12/03/2019, 10:16:01] Ben: Secret words that must never be imported.',
  ].join('\n');
  await page
    .getByTestId('doc-files')
    .setInputFiles([
      { name: 'WhatsApp Chat.txt', mimeType: 'text/plain', buffer: Buffer.from(chat) },
    ]);
  await page.getByTestId('author-select').selectOption('Anna');
  await page.getByTestId('author-import').click();
  await expect(page.getByTestId('import-log')).toContainText("kept only Anna's messages");
  await expect(page.getByTestId('memories')).toContainText('bake bread');
  await expect(page.getByTestId('memories')).not.toContainText('Secret words');
});
