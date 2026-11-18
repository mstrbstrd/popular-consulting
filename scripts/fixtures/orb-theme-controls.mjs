// Built-browser checks use the same sidebar controls as a person, including the
// mobile drawer. Theme changes must not depend on an always-mounted nav button.
export async function toggleOrbTheme(evaluate, until) {
  const previous = await evaluate('document.documentElement.dataset.theme');
  const themeTrigger = 'button[aria-label="Theme"], button.orb-appearance__trigger';
  if (!await evaluate(`Boolean(document.querySelector(${JSON.stringify(themeTrigger)}))`)) {
    await until('document.querySelector(\'button[aria-label="Chats"]\')');
    await evaluate('document.querySelector(\'button[aria-label="Chats"]\').click()');
  }
  await until(`document.querySelector(${JSON.stringify(themeTrigger)})`);
  if (!await evaluate('Boolean(document.querySelector(\'button[aria-label="Toggle dark mode"]\'))')) {
    await evaluate(`document.querySelector(${JSON.stringify(themeTrigger)}).click()`);
  }
  await until('document.querySelector(\'button[aria-label="Toggle dark mode"]\')');
  await evaluate('document.querySelector(\'button[aria-label="Toggle dark mode"]\').click()');
  await until(`document.documentElement.dataset.theme === ${JSON.stringify(previous === 'dark' ? 'light' : 'dark')}`);
  await evaluate('document.querySelector(\'button[aria-label="Close chats"], button[aria-label="Collapse chats"]\').click()');
  await until('!document.querySelector(\'.metabloom-threads__drawer, .metabloom-threads__dock[data-expanded="true"]\')');
}
