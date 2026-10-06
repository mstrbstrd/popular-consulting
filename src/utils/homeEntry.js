// Presentation intent only. Home still verifies its session with the server.
export const HOME_ENTRY_KEY = 'popcon-home-entry';

export function markHomeEntryIntent() {
  try { sessionStorage.setItem(HOME_ENTRY_KEY, String(Date.now())); } catch { /* Storage is optional. */ }
}

export function hasHomeEntryIntent() {
  try {
    const timestamp = Number(sessionStorage.getItem(HOME_ENTRY_KEY));
    const age = Date.now() - timestamp;
    return timestamp > 0 && age >= 0 && age < 30000;
  } catch { return false; }
}

export function consumeHomeEntryIntent() {
  try { sessionStorage.removeItem(HOME_ENTRY_KEY); } catch { /* Storage is optional. */ }
}
