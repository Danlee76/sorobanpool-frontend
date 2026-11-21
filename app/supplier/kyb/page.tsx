/**
 * Supplier KYB (Know Your Business) Status Page
 *
 * Displays the current KYB verification status and next steps for suppliers.
 */

'use client';

import { useEffect, useState } from 'react';

interface KYBStatus {
  status: 'pending' | 'in_review' | 'approved' | 'rejected';
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  nextStep?: string;
}

export default function KYBStatusPage() {
  const [kybStatus, setKybStatus] = useState<KYBStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchKYBStatus = async () => {
      try {
        setLoading(true);
        // TODO: Replace with actual API call to fetch KYB status
        // const response = await fetch('/api/supplier/kyb/status');
        // const data = await response.json();
        // setKybStatus(data);

        // Placeholder data
        setKybStatus({
          status: 'in_review',
          submittedAt: new Date().toISOString(),
          nextStep: 'Your KYB is under review. This typically takes 2-5 business days.',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch KYB status');
      } finally {
        setLoading(false);
      }
    };

    fetchKYBStatus();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4" />
          <p>Loading KYB status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Error</h2>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!kybStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No KYB status found</p>
        </div>
      </div>
    );
  }

  const statusConfig = {
    pending: {
      label: 'Pending',
      color: 'bg-gray-100',
      textColor: 'text-gray-800',
      badgeColor: 'bg-gray-500',
    },
    in_review: {
      label: 'Under Review',
      color: 'bg-blue-100',
      textColor: 'text-blue-800',
      badgeColor: 'bg-blue-500',
    },
    approved: {
      label: 'Approved',
      color: 'bg-green-100',
      textColor: 'text-green-800',
      badgeColor: 'bg-green-500',
    },
    rejected: {
      label: 'Rejected',
      color: 'bg-red-100',
      textColor: 'text-red-800',
      badgeColor: 'bg-red-500',
    },
  };

  const config = statusConfig[kybStatus.status];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className={`rounded-lg p-8 ${config.color}`}>
          <div className="flex items-center gap-4 mb-6">
            <div className={`${config.badgeColor} text-white rounded-full w-12 h-12 flex items-center justify-center`}>
              {kybStatus.status === 'approved' ? '✓' : '⟳'}
            </div>
            <div>
              <h1 className={`text-3xl font-bold ${config.textColor}`}>
                {config.label}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Know Your Business Verification
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {kybStatus.submittedAt && (
              <div className="bg-white bg-opacity-50 rounded p-4">
                <p className="text-sm font-semibold text-gray-700">Submitted</p>
                <p className="text-gray-600">
                  {new Date(kybStatus.submittedAt).toLocaleDateString()}
                </p>
              </div>
            )}

            {kybStatus.reviewedAt && (
              <div className="bg-white bg-opacity-50 rounded p-4">
                <p className="text-sm font-semibold text-gray-700">Reviewed</p>
                <p className="text-gray-600">
                  {new Date(kybStatus.reviewedAt).toLocaleDateString()}
                </p>
              </div>
            )}

            {kybStatus.rejectionReason && (
              <div className="bg-white bg-opacity-50 rounded p-4 border-l-4 border-red-500">
                <p className="text-sm font-semibold text-gray-700">Rejection Reason</p>
                <p className="text-gray-600 mt-1">{kybStatus.rejectionReason}</p>
              </div>
            )}

            {kybStatus.nextStep && (
              <div className="bg-white bg-opacity-50 rounded p-4 border-l-4 border-blue-500">
                <p className="text-sm font-semibold text-gray-700">Next Steps</p>
                <p className="text-gray-600 mt-1">{kybStatus.nextStep}</p>
              </div>
            )}
          </div>

          {kybStatus.status === 'approved' && (
            <div className="mt-6 bg-green-50 border border-green-200 rounded p-4">
              <p className="text-green-800">
                Your account is now fully verified. You can start listing offers.
              </p>
            </div>
          )}

          {kybStatus.status === 'rejected' && (
            <div className="mt-6 flex gap-4">
              <button className="flex-1 bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors">
                Resubmit
              </button>
              <button className="flex-1 bg-gray-300 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-400 transition-colors">
                Contact Support
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 bg-white rounded-lg p-6 border border-gray-200">
          <h2 className="text-lg font-semibold mb-4">KYB Process</h2>
          <ol className="space-y-3">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">
                1
              </span>
              <span className="text-gray-700">Submit your business information</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">
                2
              </span>
              <span className="text-gray-700">Our team reviews your documents</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">
                3
              </span>
              <span className="text-gray-700">Receive approval notification</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">
                4
              </span>
              <span className="text-gray-700">Start trading on SorobanPool</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
