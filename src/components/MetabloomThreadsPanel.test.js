import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MetabloomThreadsPanel from './MetabloomThreadsPanel';

const originalMedia = window.matchMedia;
const originalWidth = window.innerWidth;
const originalViewport = window.visualViewport;
let media;
const thread = (number, extra = {}) => ({ threadId: `thread-${number}`, title: `Chat ${number}`,
  version: 1, updatedAt: '2026-11-04T10:30:00.000Z', messageCount: 2, ...extra });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function Host({ initialExpanded = false, onExpansion, externalOpen = false, ...props }) {
  const [expanded, setExpanded] = React.useState(initialExpanded);
  return <div className="orb-page" data-thread-history-enabled="true" data-thread-history={expanded ? 'open' : 'closed'}>
    {externalOpen && <button type="button" onClick={() => setExpanded(true)}>More chats</button>}
    <div className="metabloom-chat__shell">
      <MetabloomThreadsPanel {...props} expanded={expanded} onExpandedChange={value => { onExpansion?.(value); setExpanded(value); }} />
      <textarea aria-label="Existing draft" defaultValue="Keep this draft" />
      <div role="region" aria-label="Existing component"><input aria-label="Hours" defaultValue="17" /></div>
    </div>
  </div>;
}
const callbacks = () => ({ onNew: jest.fn().mockResolvedValue(true), onOpen: jest.fn().mockResolvedValue(true),
  onRename: jest.fn().mockResolvedValue(true), onDelete: jest.fn().mockResolvedValue(true),
  onRetry: jest.fn().mockResolvedValue(true), onRefresh: jest.fn().mockResolvedValue(true), onExpansion: jest.fn() });
function mount(props = {}, { wide = false, strict = false, open = true } = {}) {
  media.matches = wide;
  window.innerWidth = wide ? 1440 : 390;
  const actions = callbacks();
  const all = { ...actions, items: [thread(1), thread(2)], activeThreadId: 'thread-1', ...props };
  const tree = <Host {...all} />;
  const view = render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree);
  const opener = screen.getByRole('button', { name: wide ? 'Expand chats' : 'Chats', exact: true });
  if (open) { act(() => opener.focus()); fireEvent.click(opener); }
  return { ...view, actions: all, opener };
}
const changeWidth = wide => act(() => {
  media.matches = wide;
  window.innerWidth = wide ? 1440 : 390;
  media.dispatchEvent(new Event('change'));
});
const rowActions = number => fireEvent.click(screen.getByRole('button', { name: `Actions for Chat ${number}` }));

beforeEach(() => {
  media = new EventTarget();
  media.matches = false;
  window.matchMedia = jest.fn(() => media);
  window.innerWidth = 390;
  window.visualViewport = undefined;
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  window.matchMedia = originalMedia;
  window.innerWidth = originalWidth;
  window.visualViewport = originalViewport;
});

test('opens a native drawer with a semantic table, current thread and full update time without invoking data actions', () => {
  const show = jest.spyOn(HTMLDialogElement.prototype, 'showModal');
  const { opener, actions } = mount();
  const dialog = screen.getByRole('dialog', { name: 'Chat history' });
  expect(dialog).toHaveAttribute('open');
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(opener).toHaveAttribute('aria-controls', dialog.id);
  expect(opener).toHaveAttribute('aria-expanded', 'true');
  expect(show).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Close chats' })).toHaveFocus();
  const table = screen.getByRole('table', { name: 'Saved chats' });
  expect(within(table).getByRole('columnheader', { name: 'Updated' })).toBeInTheDocument();
  expect(within(table).getByRole('button', { name: 'Open chat: Chat 1' })).toHaveAttribute('aria-current', 'true');
  expect(within(table).getByRole('button', { name: 'Open chat: Chat 2' })).not.toHaveAttribute('aria-current');
  expect(table.querySelector('time')).toHaveAttribute('datetime', '2026-11-04T10:30:00.000Z');
  expect(table.querySelector('time')).toHaveAccessibleName(/Updated/);
  for (const action of ['onNew', 'onOpen', 'onRename', 'onDelete', 'onRetry', 'onRefresh']) expect(actions[action]).not.toHaveBeenCalled();
});

test('Escape restores its opener and leaves the exact conversation, calculator field and draft mounted', () => {
  const view = mount({}, { open: false });
  const draft = screen.getByRole('textbox', { name: 'Existing draft' });
  const hours = screen.getByRole('textbox', { name: 'Hours' });
  fireEvent.change(hours, { target: { value: '-' } });
  act(() => view.opener.focus());
  fireEvent.click(view.opener);
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(view.opener).toHaveFocus();
  expect(screen.getByRole('textbox', { name: 'Existing draft' })).toBe(draft);
  expect(draft).toHaveValue('Keep this draft');
  expect(screen.getByRole('textbox', { name: 'Hours' })).toBe(hours);
  expect(hours).toHaveValue('-');
  expect(view.actions.onExpansion.mock.calls).toEqual([[true], [false]]);
});

test('the desktop rail expands without a modal and collapses back to its focused control', async () => {
  const show = jest.spyOn(HTMLDialogElement.prototype, 'showModal');
  const view = mount({}, { wide: true, open: false });
  expect(screen.getByRole('complementary', { name: 'Chat history' })).toHaveAttribute('data-expanded', 'false');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'New chat' })).toBeEnabled();
  fireEvent.click(view.opener);
  expect(screen.getByRole('table', { name: 'Saved chats' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(show).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse chats' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Expand chats' })).toHaveFocus());
});

test('opening through More returns focus there when the drawer is cancelled', () => {
  mount({ externalOpen: true }, { open: false });
  const more = screen.getByRole('button', { name: 'More chats' });
  act(() => more.focus());
  fireEvent.click(more);
  fireEvent.click(screen.getByRole('button', { name: 'Close chats' }));
  expect(more).toHaveFocus();
});

test('successful Open uses only the chosen thread ID and closes the overlay; selecting the current thread is inert', async () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Open chat: Chat 1' }));
  expect(view.actions.onOpen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Open chat: Chat 2' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(view.actions.onOpen).toHaveBeenCalledTimes(1);
  expect(view.actions.onOpen).toHaveBeenCalledWith('thread-2');
  expect(view.actions.onNew).not.toHaveBeenCalled();
});

test('failed Open leaves the drawer and its current selection intact', async () => {
  const onOpen = jest.fn().mockResolvedValue(false);
  mount({ onOpen });
  fireEvent.click(screen.getByRole('button', { name: 'Open chat: Chat 2' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This action could not be completed.');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open chat: Chat 1' })).toHaveAttribute('aria-current', 'true');
});

test('New chat delegates once and leaves a desktop panel docked after success', async () => {
  const view = mount({}, { wide: true });
  fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'New chat' })).toBeEnabled());
  expect(view.actions.onNew).toHaveBeenCalledTimes(1);
  expect(view.actions.onNew).toHaveBeenCalledWith();
  expect(screen.getByRole('complementary')).toHaveAttribute('data-expanded', 'true');
  expect(view.actions.onExpansion).toHaveBeenCalledTimes(1);
});

test('Rename trims its captured title, rejects blank input and closes only after acknowledgement', async () => {
  const saved = deferred();
  const onRename = jest.fn().mockReturnValue(saved.promise);
  mount({ onRename });
  rowActions(2);
  fireEvent.click(screen.getByRole('button', { name: 'Rename', exact: true }));
  const input = screen.getByRole('textbox', { name: 'Chat title' });
  expect(input).toHaveFocus();
  expect(input).toHaveAttribute('maxlength', '160');
  fireEvent.change(input, { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: 'Save title' })).toBeDisabled();
  fireEvent.submit(input.closest('form'));
  expect(onRename).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '  Revised plan  ' } });
  fireEvent.submit(input.closest('form'));
  fireEvent.submit(input.closest('form'));
  expect(onRename).toHaveBeenCalledTimes(1);
  expect(onRename).toHaveBeenCalledWith('thread-2', 'Revised plan');
  expect(input).toBeDisabled();
  await act(async () => saved.resolve(true));
  expect(screen.queryByRole('textbox', { name: 'Chat title' })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for Chat 2' })).toHaveFocus());
  expect(screen.getByRole('button', { name: 'Open chat: Chat 2' })).toBeInTheDocument();
});

test('a refused rename preserves the entered text and Escape cancels editing before closing the drawer', async () => {
  mount({ onRename: jest.fn().mockResolvedValue(false) });
  rowActions(1);
  fireEvent.click(screen.getByRole('button', { name: 'Rename', exact: true }));
  const input = screen.getByRole('textbox', { name: 'Chat title' });
  fireEvent.change(input, { target: { value: 'Keep this proposed title' } });
  fireEvent.submit(input.closest('form'));
  await screen.findByRole('alert');
  expect(input).toHaveValue('Keep this proposed title');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('textbox', { name: 'Chat title' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for Chat 1' })).toHaveFocus());
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('Delete requires confirmation, initially focuses Cancel, and keeps the saved-work distinction visible', async () => {
  const removed = deferred();
  const onDelete = jest.fn().mockReturnValue(removed.promise);
  mount({ onDelete });
  rowActions(2);
  fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(screen.getByText('This removes the saved chat. Saved work stays in your library.')).toBeInTheDocument();
  expect(onDelete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onDelete).not.toHaveBeenCalled();
  rowActions(2);
  fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete chat', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete chat', exact: true }));
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(onDelete).toHaveBeenCalledWith('thread-2');
  await act(async () => removed.resolve(false));
  expect(screen.getByRole('button', { name: 'Delete chat' })).toBeEnabled();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test.each([{ pending: true }, { busy: true }, { loading: true }])('data actions are guarded during %j while the panel can still close', async flags => {
  const view = mount(flags);
  for (const name of ['New chat', 'Open chat: Chat 2', 'Actions for Chat 2']) expect(screen.getByRole('button', { name, exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Open chat: Chat 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
  expect(view.actions.onOpen).not.toHaveBeenCalled();
  expect(view.actions.onNew).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Close chats' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Close chats' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('Save status and server errors remain honest; Retry and Save as new chat are explicit actions', async () => {
  const onSaveCopy = jest.fn().mockResolvedValue(true);
  const view = mount({ error: 'This chat changed elsewhere. Your unsaved work is still here.', saveStatus: 'Not saved',
    canSaveCopy: true, onSaveCopy });
  expect(screen.getByRole('status')).toHaveTextContent('Not saved');
  expect(screen.getByRole('alert')).toHaveTextContent('Your unsaved work is still here.');
  expect(view.actions.onRetry).not.toHaveBeenCalled();
  expect(onSaveCopy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry', exact: true }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save as new chat' })).toBeEnabled());
  expect(view.actions.onRetry).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Save as new chat' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save as new chat' })).toBeEnabled());
  expect(onSaveCopy).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('Not saved');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('recovery copy is absent without a conflict and a list failure is never shown as an empty library', () => {
  mount({ items: [], error: 'Chats are unavailable. Try again.', saveStatus: '' });
  expect(screen.queryByRole('button', { name: 'Save as new chat' })).not.toBeInTheDocument();
  expect(screen.queryByText(/No saved chats yet/)).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Chats are unavailable.');
});

test('changing between drawer and dock closes native modality and preserves the inline rename draft', () => {
  const close = jest.spyOn(HTMLDialogElement.prototype, 'close');
  mount();
  rowActions(2);
  fireEvent.click(screen.getByRole('button', { name: 'Rename', exact: true }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Chat title' }), { target: { value: 'Unfinished title' } });
  changeWidth(true);
  expect(close).toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('complementary')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Chat title' })).toHaveValue('Unfinished title');
  expect(screen.getByRole('textbox', { name: 'Chat title' })).toHaveFocus();
  changeWidth(false);
  expect(screen.getByRole('dialog')).toHaveAttribute('open');
  expect(screen.getByRole('textbox', { name: 'Chat title' })).toHaveValue('Unfinished title');
  expect(screen.getByRole('textbox', { name: 'Chat title' })).toHaveFocus();
});

test('the drawer tracks the visual viewport and leaves pinch zoom alone', () => {
  const viewport = new EventTarget();
  Object.assign(viewport, { width: 320, height: 420, offsetLeft: 4, offsetTop: 36, scale: 1 });
  window.visualViewport = viewport;
  const view = mount();
  const dialog = screen.getByRole('dialog');
  expect(dialog.style.getPropertyValue('--threads-viewport-height')).toBe('420px');
  expect(dialog.style.getPropertyValue('--threads-viewport-top')).toBe('36px');
  expect(dialog.style.getPropertyValue('--threads-viewport-left')).toBe('4px');
  act(() => { viewport.height = 360; viewport.dispatchEvent(new Event('resize')); });
  expect(dialog.style.getPropertyValue('--threads-viewport-height')).toBe('360px');
  act(() => { viewport.scale = 2; viewport.height = 180; viewport.dispatchEvent(new Event('resize')); });
  expect(dialog.style.getPropertyValue('--threads-viewport-height')).toBe('360px');
  const removed = jest.spyOn(viewport, 'removeEventListener');
  view.unmount();
  expect(removed).toHaveBeenCalledWith('resize', expect.any(Function));
  expect(removed).toHaveBeenCalledWith('scroll', expect.any(Function));
});

test('a late action receipt cannot close a reopened drawer or update an unmounted owner', async () => {
  const opened = deferred();
  const view = mount({ onOpen: jest.fn().mockReturnValue(opened.promise) }, { strict: true });
  fireEvent.click(screen.getByRole('button', { name: 'Open chat: Chat 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close chats' }));
  fireEvent.click(screen.getByRole('button', { name: 'Chats', exact: true }));
  await act(async () => opened.resolve(true));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(view.actions.onExpansion.mock.calls).toEqual([[true], [false], [true]]);
  view.unmount();
  const second = deferred();
  const next = mount({ onNew: jest.fn().mockReturnValue(second.promise) });
  fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
  next.unmount();
  await act(async () => second.resolve(true));
  expect(next.actions.onExpansion.mock.calls).toEqual([[true]]);
});
