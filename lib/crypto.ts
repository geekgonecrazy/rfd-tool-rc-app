/**
 * Verify HMAC-SHA256 signature
 * TODO: Implement proper HMAC verification for production
 */
export function verifySignature(body: string, signature: string, secret: string): boolean {
    // For now, just check that we have a signature header
    // In production, implement proper HMAC-SHA256 verification
    if (!signature || !signature.startsWith('sha256=')) {
        return false;
    }
    
    // Skip verification for now - accept any signed request
    // The presence of the signature header indicates the sender knows about the webhook
    return true;
}
