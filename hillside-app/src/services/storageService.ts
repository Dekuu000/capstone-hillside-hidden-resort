import { supabase } from '../lib/supabase';

export async function createPaymentProofSignedUrl(path: string, expiresInSeconds: number = 600) {
    const { data, error } = await supabase
        .storage
        .from('payment-proofs')
        .createSignedUrl(path, expiresInSeconds);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Failed to generate signed URL');
    return data.signedUrl;
}

export async function uploadPaymentProof(path: string, file: File) {
    const { error } = await supabase
        .storage
        .from('payment-proofs')
        .upload(path, file, { upsert: false });
    if (error) throw error;
}
