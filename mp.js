'use strict';
/* Cliente mínimo da API de Assinaturas do Mercado Pago (preapproval). Sem dependências.
   Variáveis: MP_ACCESS_TOKEN (obrigatória p/ ativar), MP_API (só para testes), MP_WEBHOOK_SECRET (opcional). */
const crypto = require('crypto');

const API = () => (process.env.MP_API || 'https://api.mercadopago.com').replace(/\/+$/, '');
const enabled = () => !!process.env.MP_ACCESS_TOKEN;

async function call(method, path, body) {
  const r = await fetch(API() + path, {
    method,
    headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { /* resposta não-JSON */ }
  if (!r.ok) {
    const e = new Error('Mercado Pago ' + r.status + ': ' + (data.message || data.error || text || '').toString().slice(0, 300));
    e.status = r.status;
    throw e;
  }
  return data;
}

const createPreapproval = (o) => call('POST', '/preapproval', {
  reason: o.reason,
  external_reference: o.externalReference,
  payer_email: o.payerEmail,
  back_url: o.backUrl,
  notification_url: o.notificationUrl,
  status: 'pending',
  auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: o.amount, currency_id: 'BRL' },
});
const getPreapproval = (id) => call('GET', '/preapproval/' + encodeURIComponent(id));
const cancelPreapproval = (id) => call('PUT', '/preapproval/' + encodeURIComponent(id), { status: 'cancelled' });
const searchPreapprovals = async (externalReference) => (await call('GET', '/preapproval/search?external_reference=' + encodeURIComponent(externalReference))).results || [];
const getAuthorizedPayment = (id) => call('GET', '/authorized_payments/' + encodeURIComponent(id));

/* Valida a assinatura do webhook (x-signature) quando MP_WEBHOOK_SECRET está definido. */
function verifySignature(headers, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true;
  const sig = String(headers['x-signature'] || '');
  const parts = Object.fromEntries(sig.split(',').map((p) => p.trim().split('=')).filter((p) => p.length === 2));
  if (!parts.ts || !parts.v1) return false;
  const manifest = 'id:' + String(dataId).toLowerCase() + ';request-id:' + (headers['x-request-id'] || '') + ';ts:' + parts.ts + ';';
  const mac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(mac), b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { enabled, createPreapproval, getPreapproval, cancelPreapproval, searchPreapprovals, getAuthorizedPayment, verifySignature };
