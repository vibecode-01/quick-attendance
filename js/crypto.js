// Shared cryptography functions for Vanilla JS
const cryptoUtil = {
    bufToBase64: (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))),
    base64ToBuf: (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer,

    // TOTP generation for QR Code (Admin Side)
    generateTOTP: async (secret, windowMs = 10000) => {
        const window = Math.floor(Date.now() / windowMs);
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(window.toString()));
        return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
    },

    // Generates a public/private keypair for the device
    generateDeviceKeys: async () => {
        const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
        const pubBuf = await crypto.subtle.exportKey("spki", keyPair.publicKey);
        const privBuf = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
        return { publicKey: cryptoUtil.bufToBase64(pubBuf), privateKeyBase64: cryptoUtil.bufToBase64(privBuf) };
    },

    // Signs the attendance payload
    signPayload: async (privateKeyB64, payloadStr) => {
        const privBuf = cryptoUtil.base64ToBuf(privateKeyB64);
        const key = await crypto.subtle.importKey("pkcs8", privBuf, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
        const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(payloadStr));
        return cryptoUtil.bufToBase64(signature);
    },

    // Simple AES wrapper to encrypt the private key using the 4-digit PIN
    encryptKeyWithPin: async (privateKeyB64, pin) => {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const aesKey = await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, enc.encode(privateKeyB64));
        return { ciphertext: cryptoUtil.bufToBase64(encrypted), iv: cryptoUtil.bufToBase64(iv), salt: cryptoUtil.bufToBase64(salt) };
    },

    decryptKeyWithPin: async (encryptedData, pin) => {
        try {
            const enc = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
            const aesKey = await crypto.subtle.deriveKey(
                { name: "PBKDF2", salt: cryptoUtil.base64ToBuf(encryptedData.salt), iterations: 100000, hash: "SHA-256" },
                keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
            );
            const decrypted = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: cryptoUtil.base64ToBuf(encryptedData.iv) },
                aesKey, cryptoUtil.base64ToBuf(encryptedData.ciphertext)
            );
            return new TextDecoder().decode(decrypted);
        } catch (e) { throw new Error("Invalid PIN"); }
    }
};
