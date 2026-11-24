const {
  MAX_CALENDAR_PROPOSAL_BYTES,
  parseCalendarProposal,
  parseCalendarReceipt,
} = require('./metabloomCalendarProtocol');
const {
  MAX_GMAIL_PROPOSAL_BYTES = 32768,
  parseGmailProposal,
  parseGmailReceipt,
} = require('./metabloomGmailProtocol');

const METABLOOM_AGENT_TIMEOUT_MS = 90000;
const MAX_METABLOOM_AGENT_CALLS = 4;
const MAX_METABLOOM_GMAIL_AGENT_CALLS = 6;
const MAX_METABLOOM_TOOL_PROGRESS = 24;
const METABLOOM_PROGRESS_WAIT_MS = 12000;
const METABLOOM_AGENT_TOOL_LABELS = Object.freeze({
  open_invoice_workspace: 'Preparing the invoice workspace', get_invoice_workspace: 'Reading the approved invoice details',
  update_invoice_workspace: 'Preparing invoice changes', focus_invoice_section: 'Preparing a field highlight',
  get_invoice_draft: 'Loading invoice draft', create_invoice_draft: 'Validating and calculating invoice draft',
  get_boom_quote_request: 'Loading boom quote request', update_boom_quote_request: 'Checking and saving boom request details',
  list_calendar_events: 'Checking your calendar', find_free_slots: 'Finding open times',
  open_calendar_workspace: 'Opening your calendar', focus_calendar_view: 'Focusing your calendar',
  create_calendar_event: 'Creating calendar event', update_calendar_event: 'Updating calendar event',
  delete_calendar_event: 'Preparing event deletion',
  list_recent_emails: 'Checking your inbox', read_email: 'Reading email',
  create_email_draft: 'Saving email draft', propose_send_email: 'Preparing email for review',
  organize_email: 'Updating email status', propose_trash_email: 'Preparing email removal',
  search_web: 'Searching the web', calculate: 'Calculating',
  get_current_time: 'Checking the time', create_visual: 'Preparing your visual',
  get_orb_state: 'Checking the Orb', express_orb: 'Choosing an expression',
  find_image: 'Finding a photo', get_quote: 'Calculating your estimate',
  get_price_book_draft: 'Loading your pricing draft', propose_price_book_changes: 'Saving your pricing rules',
});
const parseMetabloomAgentActivity = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'callId,name,state,type' || value.type !== 'tool_activity'
    || !Object.prototype.hasOwnProperty.call(METABLOOM_AGENT_TOOL_LABELS, value.name)
    || !['running', 'complete', 'failed'].includes(value.state)
    || typeof value.callId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.callId)) return null;
  return { type: value.type, callId: value.callId, name: value.name, state: value.state };
};
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const parseMetabloomToolProgress = value => {
  if (!exactKeys(value, ['type', 'name', 'callId', 'sequence', 'summary']) || value.type !== 'tool_progress'
    || value.name !== 'search_web' || typeof value.callId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.callId)
    || !Number.isInteger(value.sequence) || value.sequence < 1 || value.sequence > MAX_METABLOOM_TOOL_PROGRESS
    || typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 200
    // eslint-disable-next-line no-control-regex
    || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value.summary)) return null;
  return { ...value, summary: value.summary.trim() };
};
const parseMetabloomAgentStatus = value => exactKeys(value, ['type', 'state']) && value.type === 'agent_status'
  && ['working', 'reviewing', 'validating'].includes(value.state) ? { ...value } : null;

const parseMetabloomCalendarStreamEvent = (value, expectedRequestId) => {
  if (exactKeys(value, ['type', 'proposal']) && value.type === 'calendar_proposal') {
    const proposal = parseCalendarProposal(value.proposal, expectedRequestId);
    return proposal ? { type: 'calendar_proposal', proposal } : null;
  }
  if (exactKeys(value, ['type', 'receipt']) && value.type === 'calendar_receipt') {
    const receipt = parseCalendarReceipt(value.receipt);
    if (!receipt) return null;
    if (expectedRequestId !== undefined && receipt.requestId !== expectedRequestId) return null;
    return { type: 'calendar_receipt', receipt };
  }
  return null;
};

// Intercepts additive calendar_proposal / calendar_receipt NDJSON events after
// text_complete and before done without altering existing stream ordering.
const createMetabloomCalendarStreamBridge = (baseDecoder, {
  allowCalendar = false,
  requestId,
  onCalendarProposal,
  onCalendarReceipt,
  maxRecordChars = MAX_CALENDAR_PROPOSAL_BYTES,
} = {}) => {
  let buffer = '';
  let failed = false;
  let sawTextComplete = false;
  let sawDone = false;
  let calendarProposal = null;
  let calendarReceipt = null;

  const processLine = (line, terminated) => {
    if (failed) return false;
    const trimmed = line.trim();
    if (!trimmed) return baseDecoder.push(terminated ? `${line}\n` : line);

    let parsed = null;
    if (trimmed.startsWith('{') && (
      trimmed.includes('"calendar_proposal"')
      || trimmed.includes('"calendar_receipt"')
      || trimmed.includes('"text_complete"')
      || trimmed.includes('"done"')
    )) {
      try { parsed = JSON.parse(trimmed); } catch { parsed = null; }
    }

    if (parsed && (parsed.type === 'calendar_proposal' || parsed.type === 'calendar_receipt')) {
      if (!allowCalendar || !sawTextComplete || sawDone || line.length > maxRecordChars) {
        failed = true;
        return false;
      }
      const event = parseMetabloomCalendarStreamEvent(parsed, requestId);
      if (!event) {
        failed = true;
        return false;
      }
      if (event.type === 'calendar_proposal') {
        if (calendarProposal) {
          failed = true;
          return false;
        }
        calendarProposal = event.proposal;
      } else {
        if (calendarReceipt) {
          failed = true;
          return false;
        }
        calendarReceipt = event.receipt;
      }
      return true;
    }

    if (parsed?.type === 'text_complete') sawTextComplete = true;
    if (parsed?.type === 'done') sawDone = true;

    const ok = baseDecoder.push(terminated ? `${line}\n` : line);
    if (!ok) failed = true;
    return ok;
  };

  return {
    get offer() {
      return baseDecoder.offer;
    },
    get calendarProposal() {
      return calendarProposal;
    },
    get calendarReceipt() {
      return calendarReceipt;
    },
    push(chunk) {
      if (failed) return false;
      if (typeof chunk !== 'string') {
        failed = true;
        return false;
      }
      if (!chunk) return true;
      buffer += chunk;
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (!processLine(line, true)) return false;
        newlineIndex = buffer.indexOf('\n');
      }
      return true;
    },
    finish() {
      if (!failed && buffer.length > 0) {
        const tail = buffer;
        buffer = '';
        processLine(tail, false);
      }
      if (failed) return { ok: false, error: 'Invalid stream.' };
      const result = baseDecoder.finish();
      if (!result?.ok) return result;
      if (calendarProposal) {
        try { onCalendarProposal?.(calendarProposal); } catch { /* Callback cannot break validated reply. */ }
      }
      if (calendarReceipt) {
        try { onCalendarReceipt?.(calendarReceipt); } catch { /* Callback cannot break validated reply. */ }
      }
      if (!calendarProposal && !calendarReceipt) return result;
      return {
        ...result,
        value: {
          ...result.value,
          ...(calendarProposal ? { calendarProposal } : {}),
          ...(calendarReceipt ? { calendarReceipt } : {}),
        },
      };
    },
  };
};

const parseMetabloomGmailStreamEvent = (value, expectedRequestId) => {
  if (exactKeys(value, ['type', 'proposal']) && value.type === 'gmail_proposal') {
    const proposal = parseGmailProposal(value.proposal, expectedRequestId);
    return proposal ? { type: 'gmail_proposal', proposal } : null;
  }
  if (exactKeys(value, ['type', 'receipt']) && value.type === 'gmail_receipt') {
    const receipt = parseGmailReceipt(value.receipt);
    if (!receipt) return null;
    if (expectedRequestId !== undefined && receipt.requestId !== expectedRequestId) return null;
    return { type: 'gmail_receipt', receipt };
  }
  return null;
};

// Intercepts additive gmail_proposal / gmail_receipt NDJSON events after
// text_complete and before done without altering existing stream ordering.
const createMetabloomGmailStreamBridge = (baseDecoder, {
  allowGmail = false,
  requestId,
  onGmailProposal,
  onGmailReceipt,
  maxRecordChars = Math.max(24000, MAX_GMAIL_PROPOSAL_BYTES),
} = {}) => {
  let buffer = '';
  let failed = false;
  let sawTextComplete = false;
  let sawDone = false;
  let gmailProposal = null;
  let gmailReceipt = null;

  const processLine = (line, terminated) => {
    if (failed) return false;
    const trimmed = line.trim();
    if (!trimmed) return baseDecoder.push(terminated ? `${line}\n` : line);

    let parsed = null;
    if (trimmed.startsWith('{') && (
      trimmed.includes('"gmail_proposal"')
      || trimmed.includes('"gmail_receipt"')
      || trimmed.includes('"text_complete"')
      || trimmed.includes('"done"')
    )) {
      try { parsed = JSON.parse(trimmed); } catch { parsed = null; }
    }

    if (parsed && (parsed.type === 'gmail_proposal' || parsed.type === 'gmail_receipt')) {
      if (!allowGmail || !sawTextComplete || sawDone || line.length > maxRecordChars) {
        failed = true;
        return false;
      }
      const event = parseMetabloomGmailStreamEvent(parsed, requestId);
      if (!event) {
        failed = true;
        return false;
      }
      if (event.type === 'gmail_proposal') {
        if (gmailProposal) {
          failed = true;
          return false;
        }
        gmailProposal = event.proposal;
      } else {
        if (gmailReceipt) {
          failed = true;
          return false;
        }
        gmailReceipt = event.receipt;
      }
      return true;
    }

    if (parsed?.type === 'text_complete') sawTextComplete = true;
    if (parsed?.type === 'done') sawDone = true;

    const ok = baseDecoder.push(terminated ? `${line}\n` : line);
    if (!ok) failed = true;
    return ok;
  };

  return {
    get offer() {
      return baseDecoder.offer;
    },
    get calendarProposal() {
      return baseDecoder.calendarProposal;
    },
    get calendarReceipt() {
      return baseDecoder.calendarReceipt;
    },
    get gmailProposal() {
      return gmailProposal;
    },
    get gmailReceipt() {
      return gmailReceipt;
    },
    push(chunk) {
      if (failed) return false;
      if (typeof chunk !== 'string') {
        failed = true;
        return false;
      }
      if (!chunk) return true;
      buffer += chunk;
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (!processLine(line, true)) return false;
        newlineIndex = buffer.indexOf('\n');
      }
      return true;
    },
    finish() {
      if (!failed && buffer.length > 0) {
        const tail = buffer;
        buffer = '';
        processLine(tail, false);
      }
      if (failed) return { ok: false, error: 'Invalid stream.' };
      const result = baseDecoder.finish();
      if (!result?.ok) return result;
      if (gmailProposal) {
        try { onGmailProposal?.(gmailProposal); } catch { /* Callback cannot break validated reply. */ }
      }
      if (gmailReceipt) {
        try { onGmailReceipt?.(gmailReceipt); } catch { /* Callback cannot break validated reply. */ }
      }
      if (!gmailProposal && !gmailReceipt) return result;
      return {
        ...result,
        value: {
          ...result.value,
          ...(gmailProposal ? { gmailProposal } : {}),
          ...(gmailReceipt ? { gmailReceipt } : {}),
        },
      };
    },
  };
};

// The host and browser share this state machine. Progress is part of execution,
// not model-authored prose or a timer that pretends a milestone happened.
const createMetabloomAgentLifecycle = ({ requireStatus = false, maxCalls = MAX_METABLOOM_AGENT_CALLS } = {}) => {
  const callLimit = Number.isInteger(maxCalls) && maxCalls >= 1 ? maxCalls : MAX_METABLOOM_AGENT_CALLS;
  const calls = new Set();
  let phase = null, activeTool = null, lastTool = null, sequence = 0, summary = null, searchComplete = false, imageComplete = false;
  return {
    accept(event) {
      if (event?.type === 'agent_status') {
        const status = parseMetabloomAgentStatus(event);
        if (!status || activeTool || (status.state === 'working' ? phase !== null
          : status.state === 'reviewing' ? phase !== 'between' : !['working', 'reviewing'].includes(phase))) return null;
        phase = status.state;
        return status;
      }
      if (event?.type === 'tool_progress') {
        const progress = parseMetabloomToolProgress(event);
        if (!progress || !activeTool || progress.callId !== activeTool.callId || progress.name !== activeTool.name
          || progress.sequence !== sequence + 1) return null;
        sequence = progress.sequence; summary = progress.summary;
        return progress;
      }
      const activity = parseMetabloomAgentActivity(event);
      if (!activity) return null;
      if (activity.state === 'running') {
        if (activeTool || calls.has(activity.callId) || calls.size >= callLimit || phase === 'validating'
          || (requireStatus && !['working', 'reviewing'].includes(phase))) return null;
        calls.add(activity.callId); activeTool = activity; phase = 'tool'; sequence = 0; summary = null;
      } else {
        if (!activeTool || activity.callId !== activeTool.callId || activity.name !== activeTool.name) return null;
        if (activity.name === 'search_web' && activity.state === 'complete') searchComplete = true;
        if (activity.name === 'find_image' && activity.state === 'complete') imageComplete = true;
        lastTool = activity; activeTool = null; phase = 'between'; summary = null;
      }
      return activity;
    },
    canAnswer: () => !activeTool && (!requireStatus || phase === null || phase === 'validating'),
    getState: () => ({ phase, activeTool: activeTool && { ...activeTool }, lastTool: lastTool && { ...lastTool },
      summary, searchComplete, imageComplete, callCount: calls.size }),
  };
};

const getMetabloomWorkPresentation = ({ phase, activeTool, lastTool, summary, searchComplete }) => {
  if (activeTool) return { label: METABLOOM_AGENT_TOOL_LABELS[activeTool.name], summary };
  if (phase === 'validating') return { label: 'Checking the answer',
    summary: searchComplete ? 'Checking the response and its source references.' : 'Checking the response.' };
  if (lastTool) return { label: lastTool.state === 'failed' ? 'Handling a tool problem' : 'Reviewing results',
    summary: lastTool.state === 'failed' ? `${METABLOOM_AGENT_TOOL_LABELS[lastTool.name]} did not finish successfully.`
      : ({ open_invoice_workspace: 'Workspace opening requested. The browser must confirm it.',
        get_invoice_workspace: 'Approved invoice snapshot checked.',
        update_invoice_workspace: 'Invoice changes prepared. Page application is still pending.',
        focus_invoice_section: 'Field highlight requested. Display is still pending.',
        list_calendar_events: 'Calendar checked.',
        find_free_slots: 'Open time slots checked.',
        open_calendar_workspace: 'Calendar workspace requested.',
        focus_calendar_view: 'Calendar view focus requested.',
        create_calendar_event: 'Calendar event processed.',
        update_calendar_event: 'Calendar update processed.',
        delete_calendar_event: 'Deletion prepared for confirmation.',
        list_recent_emails: 'Inbox checked.',
        read_email: 'Email read.',
        create_email_draft: 'Email draft saved.',
        propose_send_email: 'Email ready for your confirmation.',
        organize_email: 'Email status updated.',
        propose_trash_email: 'Trash action prepared for confirmation.',
        search_web: 'Search complete. Reviewing the sources.', calculate: 'Calculation complete.',
        get_invoice_draft: 'Invoice draft checked.', create_invoice_draft: 'Invoice draft saved. Checking required fields.',
        get_boom_quote_request: 'Boom request checked.', update_boom_quote_request: 'Boom request details saved. Checking required fields.',
        get_current_time: 'Current time checked.', create_visual: 'Visual requested. Generation and display are still pending.',
        get_orb_state: 'Orb snapshot checked.', express_orb: 'Expression chosen. Playback is still pending.',
        find_image: 'Photo lookup complete.', get_quote: 'Estimate computed. Display is still pending.',
        get_price_book_draft: 'Pricing draft loaded.', propose_price_book_changes: 'Pricing draft saved. Checking the next step.' })[lastTool.name] };
  return { label: 'Working on your request', summary: null };
};
module.exports = { METABLOOM_AGENT_TIMEOUT_MS, MAX_METABLOOM_AGENT_CALLS,
  MAX_METABLOOM_GMAIL_AGENT_CALLS, MAX_METABLOOM_TOOL_PROGRESS, METABLOOM_PROGRESS_WAIT_MS,
  METABLOOM_AGENT_TOOL_LABELS, parseMetabloomAgentActivity, parseMetabloomToolProgress,
  parseMetabloomAgentStatus, parseMetabloomCalendarStreamEvent, createMetabloomCalendarStreamBridge,
  parseMetabloomGmailStreamEvent, createMetabloomGmailStreamBridge,
  createMetabloomAgentLifecycle, getMetabloomWorkPresentation };
