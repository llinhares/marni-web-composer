import { test, expect, type Page } from '@playwright/test';

/** Starts from a clean session (no autosave recovery prompt, guided tour already seen). */
async function openApp(page: Page, { tourSeen = true } = {}) {
  await page.addInitScript((seen) => {
    if (seen) localStorage.setItem('marni_tour_done', '1');
    else localStorage.removeItem('marni_tour_done');
  }, tourSeen);
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

test('works offline after the first visit (service worker)', async ({ page, context }) => {
  await openApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // A second load lets the worker cache the page and the build assets
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tocar' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tocar' })).toBeVisible();
  await expect(page.getByText('10 notas')).toBeVisible();
  await context.setOffline(false);
});

test('first visit shows the guided tour; it can be followed to the end and reopened from Help', async ({ page }) => {
  // Clear the "tour seen" flag on the first load only (init scripts also run on reload)
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-first-load')) {
      sessionStorage.setItem('e2e-first-load', '1');
      localStorage.removeItem('marni_tour_done');
    }
  });
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('marni-web-composer'));
  await page.reload();

  const tour = page.getByRole('dialog', { name: /Bem-vindo/ });
  await expect(tour).toBeVisible();
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.getByRole('heading', { name: 'Faixas' })).toBeVisible();
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByRole('heading', { name: 'Ajuda sempre à mão' })).toBeVisible();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByRole('heading', { name: 'Ajuda sempre à mão' })).toBeHidden();

  // Not shown again on reload
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tocar' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Bem-vindo/ })).toHaveCount(0);

  // Help center: commands tab and the tour again
  await page.getByRole('button', { name: 'Ajuda' }).click();
  await page.getByRole('tab', { name: 'Comandos' }).click();
  await expect(page.getByText('Tocar / pausar')).toBeVisible();
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await expect(page.getByText(/Versão v2\.2/)).toBeVisible();
  await page.getByRole('tab', { name: 'Como usar' }).click();
  await page.getByRole('button', { name: 'Fazer o tour guiado' }).click();
  await expect(page.getByRole('dialog', { name: /Bem-vindo/ })).toBeVisible();
});
