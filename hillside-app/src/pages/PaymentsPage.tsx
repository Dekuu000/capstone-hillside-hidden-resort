import { useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, XCircle, ExternalLink } from 'lucide-react';
import { AdminLayout } from '../components/layout/AdminLayout';
import { usePendingPayments, useVerifyPayment } from '../features/payments/usePayments';
import { supabase } from '../lib/supabase';

export function PaymentsPage() {
    const { data: payments, isLoading, error } = usePendingPayments();
    const verifyPayment = useVerifyPayment();
    const [proofLinks, setProofLinks] = useState<Record<string, string>>({});
    const [loadingProof, setLoadingProof] = useState<Record<string, boolean>>({});

    async function openProof(paymentId: string, proofPath?: string | null) {
        if (!proofPath) return;
        if (proofLinks[paymentId]) {
            window.open(proofLinks[paymentId], '_blank', 'noopener,noreferrer');
            return;
        }

        try {
            setLoadingProof(prev => ({ ...prev, [paymentId]: true }));
            const { data, error: signedError } = await supabase
                .storage
                .from('payment-proofs')
                .createSignedUrl(proofPath, 600);
            if (signedError || !data?.signedUrl) {
                throw signedError || new Error('Failed to generate signed URL');
            }
            setProofLinks(prev => ({ ...prev, [paymentId]: data.signedUrl }));
            window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
        } finally {
            setLoadingProof(prev => ({ ...prev, [paymentId]: false }));
        }
    }

    if (error) {
        return (
            <AdminLayout>
                <div className="text-center py-12">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900">Error Loading Payments</h2>
                    <p className="text-gray-600 mt-2">{(error as Error).message}</p>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
                    <p className="text-gray-600">Review and verify pending payments</p>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : payments?.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                        <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No pending payments</h3>
                        <p className="text-gray-500">All payments are processed.</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Reservation</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Guest</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Amount</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Type</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Method</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Reference</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Proof</th>
                                        <th className="text-right px-6 py-4 text-sm font-semibold text-gray-900">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {payments?.map((payment) => {
                                        return (
                                            <tr key={payment.payment_id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4">
                                                    <span className="font-mono text-sm font-medium text-primary">
                                                        {payment.reservation?.reservation_code || 'N/A'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div>
                                                        <p className="font-medium text-gray-900">
                                                            {payment.reservation?.guest?.name || 'Unknown'}
                                                        </p>
                                                        <p className="text-sm text-gray-500">
                                                            {payment.reservation?.guest?.email || ''}
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="font-semibold text-gray-900">
                                                        ₱{payment.amount.toLocaleString()}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-sm text-gray-700 capitalize">
                                                        {payment.payment_type.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-sm text-gray-700 capitalize">
                                                        {payment.method}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-sm text-gray-700">
                                                        {payment.reference_no || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {payment.proof_url ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => openProof(payment.payment_id, payment.proof_url)}
                                                            className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                                                            disabled={loadingProof[payment.payment_id]}
                                                        >
                                                            {loadingProof[payment.payment_id] ? 'Loading...' : 'View'}
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </button>
                                                    ) : (
                                                        <span className="text-sm text-gray-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => verifyPayment.mutateAsync({
                                                                paymentId: payment.payment_id,
                                                                approved: true,
                                                            })}
                                                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                            title="Verify Payment"
                                                        >
                                                            <CheckCircle className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => verifyPayment.mutateAsync({
                                                                paymentId: payment.payment_id,
                                                                approved: false,
                                                            })}
                                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Reject Payment"
                                                        >
                                                            <XCircle className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
