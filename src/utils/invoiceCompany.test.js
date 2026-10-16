import { createInvoice, normalizeInvoiceDraft, parseInvoiceDraft } from './invoice';

test('new Popular Consulting invoices use the supplied sender business number exactly once', () => {
  const invoice = createInvoice();
  expect(invoice.companyName).toBe('Popular Consulting');
  expect(invoice.businessNumber).toBe('79078225');
  expect(invoice.taxNumber).toBe('');
  expect(invoice.clientName).toBe('DY Concrete Pumps Inc.');
  expect(invoice.clientAddress).not.toContain(invoice.businessNumber);
  expect(createInvoice().businessNumber).toBe('79078225');
});

test('saved and exported drafts round-trip the sender identifier without coercion', () => {
  const invoice = createInvoice();
  expect(parseInvoiceDraft(JSON.stringify(normalizeInvoiceDraft(invoice)))).toEqual(invoice);
});

test.each(['', '001234567', 'custom-registration'])('importing a draft preserves its explicit number %s', businessNumber => {
  const invoice = { ...createInvoice(), businessNumber };
  expect(parseInvoiceDraft(JSON.stringify(invoice)).businessNumber).toBe(businessNumber);
});

test('the Popular Consulting default never rewrites another sender or tax registration', () => {
  const invoice = { ...createInvoice(), companyName: 'Another studio', businessNumber: '000123456', taxNumber: '000123456RT0001' };
  expect(normalizeInvoiceDraft(invoice)).toEqual(invoice);
});
