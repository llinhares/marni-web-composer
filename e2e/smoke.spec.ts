import { test, expect, type Page } from '@playwright/test';

/** Starts from a clean session (no autosave recovery prompt). */
async function openApp(page: Page) {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('marni-web-composer'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tocar' })).toBeVisible();
}

test('loads the editor with the demo song', async ({ page }) => {
  await openApp(page);
  await expect(page.getByText('10 notas')).toBeVisible();
  await expect(page).toHaveTitle(/Marni Web Composer/);
});

test('play and stop move and reset the playhead', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Tocar' }).click();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByTitle('Compasso.tempo')).not.toHaveText('1.1');
  await page.getByRole('button', { name: 'Parar' }).click();
  await expect(page.getByTitle('Compasso.tempo')).toHaveText('1.1');
});

test('editing marks the project unsaved and undo restores it', async ({ page }) => {
  await openApp(page);
  const title = page.getByLabel('Título da Música');
  await title.fill('Minha música');
  await expect(page).toHaveTitle(/^• Minha música/);

  // Select all notes, delete them, undo
  await page.locator('canvas').first().click({ position: { x: 600, y: 400 } });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await expect(page.getByText('0 notas')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByText('10 notas')).toBeVisible();
});

test('BDO export dialog validates the song', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /Exportar para o BDO/ }).click();
  await expect(page.getByRole('dialog', { name: /Exportar para o BDO/ })).toBeVisible();
  await expect(page.getByText(/Pronta para o jogo|Faixas|Notas/).first()).toBeVisible();
});
