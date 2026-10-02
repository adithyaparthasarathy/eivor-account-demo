// The one contact address, in one place (FRONTEND-SPEC.md 4.1 item 11).
//
// Empty until Ethan gives an address. While it is empty, every Contact link
// goes to the set-up form and the line beside the form says the address is
// coming. Never put a made-up address here: no example.com, no placeholder.
export const CONTACT_EMAIL = 'hello@example.com';

// The one contact phone number (Ethan, 27 September 2026), as a phone dials
// it. A person's number, labelled "Call us": never the robot's demo line, so
// it never goes in [data-callnow-tel], the demo-number meta tags or the
// Worker's DEMO_NUMBER. Empty hides every phone spot.
export const CONTACT_PHONE = '+12065550100';

/** "+12065550100" reads "(206) 555-0100"; anything else is shown as given. */
export function phoneReadable(raw = CONTACT_PHONE) {
  const digits = String(raw).replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return String(raw);
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** The number as a tel: link dials it. */
export const phoneHref = (raw = CONTACT_PHONE) => `tel:${String(raw).replace(/[^\d+]/g, '')}`;

const COMING = 'Email address coming soon. Until then, use the form and we email you back.';

// Fills every [data-contact] link and every [data-contact-line] line, and
// every phone spot: [data-contact-phone] links (the footer) and
// [data-contact-phone-line] lines (the Contact section). Phone spots ship
// hidden and show only when there is a number.
export function fillContact(root = document, email = CONTACT_EMAIL, phone = CONTACT_PHONE) {
  const number = String(phone || '').trim();
  for (const a of root.querySelectorAll('[data-contact-phone]')) {
    if (!number) { a.hidden = true; continue; }
    a.setAttribute('href', phoneHref(number));
    a.textContent = `Call us ${phoneReadable(number)}`;
    a.hidden = false;
  }
  for (const line of root.querySelectorAll('[data-contact-phone-line]')) {
    if (!number) { line.hidden = true; continue; }
    const link = document.createElement('a');
    link.className = 'tl';
    link.href = phoneHref(number);
    link.textContent = phoneReadable(number);
    line.replaceChildren('Call us at ', link, '.');
    line.hidden = false;
  }
  const address = String(email || '').trim();
  for (const a of root.querySelectorAll('[data-contact]')) {
    a.setAttribute('href', address ? `mailto:${address}` : '/#setup');
  }
  for (const line of root.querySelectorAll('[data-contact-line]')) {
    if (!address) { line.textContent = COMING; continue; }
    const link = document.createElement('a');
    link.className = 'tl';
    link.href = `mailto:${address}`;
    link.textContent = address;
    line.replaceChildren('Or email us at ', link, '.');
  }
}
