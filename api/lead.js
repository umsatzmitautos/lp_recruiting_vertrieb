// Meta Conversions API (server-side) für Bewerbungen.
// Sendet ein "Lead"-Event serverseitig an den UMA-Karriere-Pixel.
// Der Zugriffstoken kommt AUSSCHLIESSLICH aus der Vercel-Umgebungsvariable
// META_CAPI_TOKEN (niemals im Code/Repo). Optional: META_TEST_EVENT_CODE zum Testen.

const crypto = require('crypto');

const PIXEL_ID = '632871806191713';        // UMA - Karriere Pixel
const API_VERSION = 'v21.0';

function sha256(v) {
  return crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const token = process.env.META_CAPI_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'META_CAPI_TOKEN nicht gesetzt' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';

  const user_data = {};
  if (body.email) user_data.em = [sha256(body.email)];
  if (body.phone) { const ph = String(body.phone).replace(/\D/g, ''); if (ph) user_data.ph = [sha256(ph)]; }
  if (body.firstName) user_data.fn = [sha256(body.firstName)];
  if (body.lastName)  user_data.ln = [sha256(body.lastName)];
  if (ip) user_data.client_ip_address = ip;
  if (ua) user_data.client_user_agent = ua;
  if (body.fbp) user_data.fbp = body.fbp;
  if (body.fbc) user_data.fbc = body.fbc;

  const event = {
    event_name: 'Lead',
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: body.sourceUrl || 'https://bewerbung.umsatzmitautos.de/vertrieb',
    event_id: body.eventId || crypto.randomUUID(),   // gleiche ID wie Browser-Pixel -> Dedup
    user_data
  };

  const payload = { data: [event] };
  const testCode = body.testEventCode || process.env.META_TEST_EVENT_CODE;
  if (testCode) payload.test_event_code = testCode;

  try {
    const r = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    const j = await r.json();
    if (!r.ok) { res.status(502).json({ error: 'Meta CAPI error', detail: j }); return; }
    res.status(200).json({ ok: true, events_received: j.events_received, fbtrace_id: j.fbtrace_id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
