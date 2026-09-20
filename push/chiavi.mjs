/**
 * Genera la coppia di chiavi VAPID, quelle che identificano il mittente
 * delle notifiche. La pubblica finisce nell'app, la privata solo dentro
 * Cloudflare. Si esegue una volta sola: node push/chiavi.mjs
 */
import { webcrypto as crypto } from 'node:crypto';

const b64 = buf => Buffer.from(buf).toString('base64url');

const coppia = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pubblica = await crypto.subtle.exportKey('raw', coppia.publicKey);      // 65 byte
const privata = await crypto.subtle.exportKey('jwk', coppia.privateKey);

console.log('VAPID_PUBBLICA =', b64(pubblica));
console.log('VAPID_PRIVATA  =', JSON.stringify({ kty: 'EC', crv: 'P-256', d: privata.d, x: privata.x, y: privata.y }));
