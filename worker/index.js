// ============================================
// STREAMLINE STUDIOS — form backend (Cloudflare Worker)
//
// Handles POST /api/contact from the three inquiry forms (two on
// booking.html, one on events.html) and emails the details to the studio
// inbox through Cloudflare's send_email binding (env.EMAIL, configured in
// wrangler.jsonc). Every other request falls through to the static site.
//
// Free-plan rule: Cloudflare only delivers to *verified destination
// addresses* unless you pay for Email Sending, so this Worker only ever
// sends to DESTINATION below. There is deliberately no auto-reply to the
// person who filled out the form.
// ============================================

// Must be a verified destination address under Email Routing.
const DESTINATION = 'contact.streamlinestudios@gmail.com';

// Must be an address on a domain with Email Routing enabled. It does not
// need to be a real mailbox or have a routing rule.
const SENDER = { email: 'forms@streamlinestudios.co', name: 'Streamline Studios Website' };

// Hidden field real visitors never see or fill in. Bots usually do.
const HONEYPOT_FIELD = 'website';

const MAX_BODY_BYTES = 20000;
const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

// Fields included in the email, in this order. Anything else is ignored.
const FIELDS = [
  ['name', 'Name', 100],
  ['email', 'Email', 254],
  ['phone', 'Phone', 40],
  ['package', 'Package', 80],
  ['addons', 'Add-ons', 400],
  ['location_preference', 'Location preference', 80],
  ['preferred_date', 'Preferred date', 40],
  ['preferred_location', 'Preferred location', 200],
  ['event_type', 'Event type', 80],
  ['event_date', 'Event date', 40],
  ['message', 'Message', 5000],
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') {
      if (request.method !== 'POST') {
        return reply(request, 405, 'This address only accepts form submissions.');
      }
      return handleContact(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env, url) {
  // Only accept posts that come from the site's own pages.
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) {
    return reply(request, 403, 'This form can only be submitted from the Streamline Studios site.');
  }

  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY_BYTES) {
    return reply(request, 413, 'That message is too long. Please shorten it and try again.');
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(request, 400, 'The form could not be read. Please try again.');
  }

  // Honeypot: pretend it worked so the bot moves on, but send nothing.
  if (clean(form.get(HONEYPOT_FIELD), 200)) {
    return reply(request, 200, 'Thanks — your message was sent.');
  }

  const values = {};
  for (const [key, , max] of FIELDS) {
    const all = form.getAll(key).map(v => clean(v, max)).filter(Boolean);
    values[key] = key === 'message' ? all.join('\n') : all.join(', ').slice(0, max);
  }
  // The message keeps its line breaks; every other field is single-line.
  values.message = cleanMultiline(form.get('message'), 5000);

  if (!values.name) {
    return reply(request, 400, 'Please enter your name.');
  }
  if (!EMAIL_PATTERN.test(values.email)) {
    return reply(request, 400, 'Please enter a valid email address.');
  }

  const subject = clean(form.get('_subject'), 150) || `Website inquiry (${values.name})`;
  const lines = FIELDS
    .filter(([key]) => values[key])
    .map(([key, label]) => (key === 'message' ? `\n${label}:\n${values[key]}` : `${label}: ${values[key]}`));
  const text = `${lines.join('\n')}\n\n--\nSent from the form on ${url.hostname}. Reply to this email to answer ${values.name} directly.`;

  const message = { to: DESTINATION, from: SENDER, subject, text };
  try {
    try {
      // replyTo makes hitting "Reply" in Gmail go to the client, not the site.
      await env.EMAIL.send({ ...message, replyTo: values.email });
    } catch (err) {
      // If the beta API rejects replyTo, still deliver the inquiry; the
      // client's address is in the body either way.
      console.error('send with replyTo failed, retrying without:', err.code, err.message);
      await env.EMAIL.send(message);
    }
  } catch (err) {
    console.error('send_email failed:', err.code, err.message);
    return reply(request, 502, `Your message could not be sent. Please email ${DESTINATION} directly.`);
  }

  return reply(request, 200, "Thanks — your message was sent. I'll reply within 24 hours.");
}

// Single-line text: strips control characters (including line breaks, which
// blocks email header injection through the subject) and trims to max length.
function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

function cleanMultiline(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

// script.js submits with fetch and asks for JSON. If JavaScript is off, the
// browser posts the form normally and gets a small plain page instead.
function reply(request, status, message) {
  const ok = status >= 200 && status < 300;
  if ((request.headers.get('Accept') || '').includes('application/json')) {
    return Response.json({ ok, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
  const safe = message.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex"><title>${ok ? 'Message sent' : 'Message not sent'} — Streamline Studios</title><link rel="stylesheet" href="/styles.css"></head><body><main class="center" style="max-width:var(--max); margin:0 auto; padding:12rem clamp(1.25rem, 4vw, 3rem) 8rem;"><p class="eyebrow center">${ok ? 'SENT' : 'NOT SENT'}</p><h1 style="font-size:clamp(2.5rem, 8vw, 5.5rem); margin-bottom:1.5rem;">${ok ? 'Thank you' : 'Something went wrong'}</h1><p style="color:var(--smoke); max-width:50ch; margin:0 auto 2.5rem;">${safe}</p><a href="/index.html" class="btn btn-solid">Back to Home</a></main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' } });
}
