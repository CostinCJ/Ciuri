import { expect, test, type Locator, type Page } from '@playwright/test';

const NAMES = ['Ana', 'Bogdan', 'Cristi', 'Dana'];

/** Polls all pages until `pick(page)` is visible on one of them; returns that page. */
async function pageWith(pages: Page[], pick: (page: Page) => Locator, timeout = 30_000): Promise<Page> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const page of pages) {
      if (await pick(page).first().isVisible()) return page;
    }
    await pages[0].waitForTimeout(200);
  }
  throw new Error('No page reached the expected state');
}

const hand = (page: Page) => page.getByRole('group', { name: 'Mâna ta' }).getByRole('button');
const playableCards = (page: Page) => hand(page).and(page.locator(':enabled'));
const passButton = (page: Page) =>
  page.getByRole('group', { name: 'Licitație' }).getByRole('button', { name: 'Pas', exact: true });
const tableCards = (page: Page) => page.getByRole('region', { name: 'Masa' }).getByRole('img');

test('four players meet, bid, play a card and chat', async ({ browser }) => {
  const contexts = await Promise.all(NAMES.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [host, ...guests] = pages;

  // The host creates a room; the others join by its link.
  await host.goto('/');
  await host.getByLabel('Numele tău').fill(NAMES[0]);
  await host.getByRole('button', { name: 'Creează cameră' }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]{4}$/);
  const roomUrl = host.url();

  for (const [i, page] of guests.entries()) {
    await page.goto(roomUrl);
    await page.getByLabel('Numele tău').fill(NAMES[i + 1]);
    await page.getByRole('button', { name: 'Continuă' }).click();
  }

  // Everyone takes a seat; the seat button then shows the player's name.
  for (const [i, page] of pages.entries()) {
    await page.getByRole('button', { name: new RegExp(`^Locul ${i + 1} `) }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^Locul ${i + 1} .*${NAMES[i]}`) })).toBeVisible();
  }

  // Four seated players start the game automatically with 3 cards each.
  for (const page of pages) await expect(hand(page)).toHaveCount(3, { timeout: 30_000 });

  // Everyone passes stage 1 (5 cards each), then the first player passes stage 2 → normal game.
  // (A redeal, when the dealer's opponents hold no trump, is rare enough to ignore here.)
  for (let i = 0; i < 5; i++) {
    const bidder = await pageWith(pages, passButton);
    await passButton(bidder).click();
    await expect(passButton(bidder)).toBeHidden();
  }
  for (const page of pages) await expect(hand(page)).toHaveCount(5, { timeout: 30_000 });

  // The first player plays a legal card; everyone sees that card on the table.
  const leader = await pageWith(pages, playableCards);
  const card = playableCards(leader).first();
  const cardLabel = await card.getAttribute('aria-label');
  expect(cardLabel).toBeTruthy();
  await card.click();
  // A card that completes a pair asks whether to declare it; wait for either outcome.
  const declare = leader.getByRole('dialog', { name: 'Strigare' });
  await expect(declare.or(tableCards(leader)).first()).toBeVisible({ timeout: 15_000 });
  if (await declare.isVisible()) await declare.getByRole('button', { name: 'Nu', exact: true }).click();
  for (const page of pages) {
    await expect(tableCards(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(tableCards(page)).toHaveAccessibleName(cardLabel!);
  }
  await expect(hand(leader)).toHaveCount(4);

  // Chat reaches the other players.
  await host.getByLabel('Mesaj').fill('Noroc la toți!');
  await host.getByRole('button', { name: 'Trimite', exact: true }).click();
  for (const page of guests) await expect(page.getByText('Noroc la toți!')).toBeVisible({ timeout: 15_000 });

  await Promise.all(contexts.map((context) => context.close()));
});
