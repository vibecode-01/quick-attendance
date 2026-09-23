// Shared & Server functions
export async function generateTOTP(secret: string, windowMs = 10000): Promise<string> {
  const window = Math.floor(Date.now() / windowMs);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(window.toString()));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth radius in meters
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}

// Browser-only WebCrypto functions
export async function generateDeviceKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]
  );
  const exportedPubKey = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const exportedPrivKey = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  
  return { 
    pubKey: Buffer.from(exportedPubKey).toString('base64'), 
    privKey: Buffer.from(exportedPrivKey).toString('base64') 
  };
}

export async function signPayload(privateKeyBase64: string, payload: string) {
  const privKeyBuffer = Buffer.from(privateKeyBase64, 'base64');
  const privateKey = await window.crypto.subtle.importKey(
    "pkcs8", privKeyBuffer, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  const signature = await window.crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } }, privateKey, new TextEncoder().encode(payload)
  );
  return Buffer.from(signature).toString('base64');
}
