import { expect, test } from '@playwright/test';

test('landing explains the product and links to the demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('memory that outlasts you');
  await page.getByTestId('cta-demo').click();
  await expect(page.getByTestId('ai-banner')).toContainText('AI reconstruction');
  await expect(page.getByTestId('timeline').locator('li')).toHaveCount(8);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('fictional');
});

test('theme toggle and keyboard shortcuts work', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('t');
  const first = await page.evaluate(() => document.documentElement.dataset['theme']);
  await page.keyboard.press('t');
  const second = await page.evaluate(() => document.documentElement.dataset['theme']);
  expect(first).not.toBe(second);
  await page.keyboard.press('g');
  await page.keyboard.press('d');
  await expect(page).toHaveURL(/#\/demo$/);
});

test('vault: create, lock, wrong passphrase, unlock, delete', async ({ page }) => {
  await page.goto('/#/vault');
  await page.getByTestId('passphrase').fill('correct horse battery');
  await page.getByTestId('passphrase2').fill('correct horse battery');
  await page.getByTestId('vault-submit').click();
  await expect(page.getByTestId('vault-empty')).toBeVisible();
  await page.getByTestId('lock').click();
  await page.getByTestId('passphrase').fill('nope nope nope');
  await page.getByTestId('vault-submit').click();
  await expect(page.getByTestId('vault-error')).toHaveText('Wrong passphrase.');
  await page.getByTestId('passphrase').fill('correct horse battery');
  await page.getByTestId('vault-submit').click();
  await expect(page.getByTestId('vault-empty')).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('delete').click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Create your private vault');
});
