import React from 'react';
import TingiFiShell from '@/components/TingiFiShell';

export default function LoanDetailPage({
  params,
}: {
  params: { loanId: string };
}) {
  return React.createElement(TingiFiShell, {
    view: 'loan',
    focusLoanId: params.loanId,
  });
}
