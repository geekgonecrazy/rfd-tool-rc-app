/**
 * Verify HMAC-SHA256 signature
 * Note: Rocket.Chat Apps have limited crypto access, so we use a timing-safe comparison
 */
export function verifySignature(body: string, signature: string, secret: string): boolean {
    if (!signature || !signature.startsWith('sha256=')) {
        return false;
    }

    const providedHash = signature.slice(7); // Remove 'sha256=' prefix
    const expectedHash = computeHmacSha256(body, secret);

    // Timing-safe comparison
    return timingSafeEqual(providedHash, expectedHash);
}

/**
 * Simple HMAC-SHA256 implementation using SubtleCrypto-like approach
 * Note: This is a simplified version for the Apps Engine environment
 */
function computeHmacSha256(message: string, secret: string): string {
    // In a real implementation, we'd use crypto.createHmac
    // For RC Apps, we may need to use a pure JS implementation or trust the signature header
    // For now, we'll implement a basic check that can be enhanced
    
    // This is a placeholder - in production, use proper HMAC
    // The Apps Engine may provide crypto utilities we can leverage
    return hmacSha256(message, secret);
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
}

/**
 * Pure JavaScript HMAC-SHA256 implementation
 * Based on the HMAC algorithm defined in RFC 2104
 */
function hmacSha256(message: string, key: string): string {
    const blockSize = 64; // SHA-256 block size in bytes
    
    // Convert strings to byte arrays
    let keyBytes = stringToBytes(key);
    const messageBytes = stringToBytes(message);
    
    // If key is longer than block size, hash it
    if (keyBytes.length > blockSize) {
        keyBytes = sha256Bytes(keyBytes);
    }
    
    // Pad key to block size
    if (keyBytes.length < blockSize) {
        const paddedKey = new Uint8Array(blockSize);
        paddedKey.set(keyBytes);
        keyBytes = paddedKey;
    }
    
    // Create inner and outer padded keys
    const innerPadded = new Uint8Array(blockSize);
    const outerPadded = new Uint8Array(blockSize);
    
    for (let i = 0; i < blockSize; i++) {
        innerPadded[i] = keyBytes[i] ^ 0x36;
        outerPadded[i] = keyBytes[i] ^ 0x5c;
    }
    
    // Inner hash: SHA256(innerPadded + message)
    const innerData = new Uint8Array(blockSize + messageBytes.length);
    innerData.set(innerPadded);
    innerData.set(messageBytes, blockSize);
    const innerHash = sha256Bytes(innerData);
    
    // Outer hash: SHA256(outerPadded + innerHash)
    const outerData = new Uint8Array(blockSize + 32);
    outerData.set(outerPadded);
    outerData.set(innerHash, blockSize);
    const finalHash = sha256Bytes(outerData);
    
    return bytesToHex(finalHash);
}

function stringToBytes(str: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(str);
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * SHA-256 implementation
 */
function sha256Bytes(data: Uint8Array): Uint8Array {
    // SHA-256 constants
    const K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);

    // Initial hash values
    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;

    // Pre-processing: adding padding bits
    const bitLength = data.length * 8;
    const paddingLength = ((448 - (bitLength + 1) % 512) + 512) % 512;
    const totalLength = data.length + 1 + (paddingLength / 8) + 8;
    const padded = new Uint8Array(totalLength);
    
    padded.set(data);
    padded[data.length] = 0x80;
    
    // Append length in bits as 64-bit big-endian
    const view = new DataView(padded.buffer);
    view.setUint32(totalLength - 4, bitLength, false);

    // Process each 512-bit block
    const W = new Uint32Array(64);
    
    for (let offset = 0; offset < totalLength; offset += 64) {
        // Prepare message schedule
        for (let i = 0; i < 16; i++) {
            W[i] = view.getUint32(offset + i * 4, false);
        }
        
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(W[i-15], 7) ^ rotr(W[i-15], 18) ^ (W[i-15] >>> 3);
            const s1 = rotr(W[i-2], 17) ^ rotr(W[i-2], 19) ^ (W[i-2] >>> 10);
            W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
        }

        // Initialize working variables
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

        // Main loop
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        // Add to hash
        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
        h5 = (h5 + f) >>> 0;
        h6 = (h6 + g) >>> 0;
        h7 = (h7 + h) >>> 0;
    }

    // Produce final hash
    const result = new Uint8Array(32);
    const resultView = new DataView(result.buffer);
    resultView.setUint32(0, h0, false);
    resultView.setUint32(4, h1, false);
    resultView.setUint32(8, h2, false);
    resultView.setUint32(12, h3, false);
    resultView.setUint32(16, h4, false);
    resultView.setUint32(20, h5, false);
    resultView.setUint32(24, h6, false);
    resultView.setUint32(28, h7, false);

    return result;
}

function rotr(n: number, d: number): number {
    return (n >>> d) | (n << (32 - d));
}
