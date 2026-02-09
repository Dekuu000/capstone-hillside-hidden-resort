import { formatPeso } from '../../lib/formatting';

interface PaymentSummaryBreakdownProps {
    payNow: number;
    balanceOnSite: number;
    isFullPayment: boolean;
    payNowLabel?: string;
    payLaterLabel?: string;
    payNowHint?: string;
    payLaterHint?: string;
    className?: string;
    emphasizePayNow?: boolean;
}

export function PaymentSummaryBreakdown({
    payNow,
    balanceOnSite,
    isFullPayment,
    payNowLabel = 'Pay now (online)',
    payLaterLabel = 'Pay later (on-site)',
    payNowHint = 'Due today',
    payLaterHint,
    className = '',
    emphasizePayNow = true,
}: PaymentSummaryBreakdownProps) {
    const resolvedPayLaterHint = balanceOnSite === 0 ? 'No balance due' : (payLaterHint || 'Due on arrival');

    return (
        <div className={`rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2 ${className}`.trim()}>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-gray-700">{payNowLabel}</p>
                    <p className="text-xs text-gray-500">{payNowHint}</p>
                </div>
                <div className="text-right">
                    <p className={`${emphasizePayNow ? 'font-semibold' : 'font-medium'} text-gray-900`}>
                        {formatPeso(payNow)}
                    </p>
                    <span
                        className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            isFullPayment ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}
                    >
                        {isFullPayment ? 'Full payment' : 'Deposit'}
                    </span>
                </div>
            </div>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-gray-600">{payLaterLabel}</p>
                    <p className="text-xs text-gray-500">{resolvedPayLaterHint}</p>
                </div>
                <span className="font-medium text-gray-900">{formatPeso(balanceOnSite)}</span>
            </div>
        </div>
    );
}
