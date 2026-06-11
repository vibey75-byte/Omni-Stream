import { webcrypto } from 'crypto';

const crypto = webcrypto;
const PASSPHRASE = 'x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9';

export async function encryptItemId(itemId: string) {
    try {
        const textEncoder = new TextEncoder();
        const keyData = textEncoder.encode(PASSPHRASE);
        const iv = textEncoder.encode(PASSPHRASE.substring(0, 16));

        const key = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'AES-CBC' },
            false,
            ['encrypt']
        );

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-CBC', iv: iv },
            key,
            textEncoder.encode(itemId)
        );

        const encryptedArray = new Uint8Array(encrypted);
        const binaryString = String.fromCharCode(...encryptedArray);
        const base64 = Buffer.from(binaryString, 'binary').toString('base64');

        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    } catch (error) {
        throw error;
    }
}
