'use client';

import { useState, useEffect } from 'react';
import { inr } from '@/lib/format';

/* ─── Types ─────────────────────────────────────────────── */
interface RazorpayResult {
  paymentId: string;
  method: string;
  amount: number;
}

interface Props {
  open: boolean;
  amount: number;
  invoiceNumber: string;
  customerName: string;
  onSuccess: (result: RazorpayResult) => void;
  onDismiss: () => void;
}

type PayMethod = 'upi' | 'card' | 'netbanking';

const BANKS = ['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Kotak Bank', 'Yes Bank'];

/* ─── Helpers ───────────────────────────────────────────── */
function genPayId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'pay_';
  for (let i = 0; i < 16; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/* ─── Razorpay Dummy Modal ──────────────────────────────── */
export function RazorpayModal({ open, amount, invoiceNumber, customerName, onSuccess, onDismiss }: Props) {
  const [tab, setTab] = useState<PayMethod>('upi');
  const [upiId, setUpiId] = useState('');
  const [cardNo, setCardNo] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [bank, setBank] = useState(BANKS[0]);
  const [stage, setStage] = useState<'form' | 'processing' | 'success'>('form');
  const [error, setError] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setTab('upi');
      setUpiId('');
      setCardNo('');
      setExpiry('');
      setCvv('');
      setCardName('');
      setBank(BANKS[0]);
      setStage('form');
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const handlePay = () => {
    setError('');

    if (tab === 'upi') {
      if (!upiId.includes('@')) { setError('Enter a valid UPI ID (e.g. name@upi)'); return; }
    } else if (tab === 'card') {
      const rawCard = cardNo.replace(/\s/g, '');
      if (rawCard.length < 16) { setError('Enter a valid 16-digit card number'); return; }
      if (!expiry.match(/^\d{2}\/\d{2}$/)) { setError('Enter expiry as MM/YY'); return; }
      if (cvv.length < 3) { setError('Enter a valid CVV'); return; }
      if (!cardName.trim()) { setError('Enter the name on card'); return; }
    }

    setStage('processing');
    setTimeout(() => {
      setStage('success');
      setTimeout(() => {
        const methodLabel =
          tab === 'upi' ? 'Razorpay UPI' :
          tab === 'card' ? 'Razorpay Card' : `Razorpay Netbanking (${bank})`;
        onSuccess({ paymentId: genPayId(), method: methodLabel, amount });
      }, 1200);
    }, 2000);
  };

  const formatCard = (v: string) =>
    v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();

  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* Razorpay Header */}
        <div className="flex items-center justify-between bg-[#072654] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
                <path d="M18 0L0 36h13.5L18 24l4.5 12H36L18 0z" fill="#3395FF"/>
              </svg>
              <span className="text-sm font-bold tracking-wide text-white">razorpay</span>
            </div>
            <p className="mt-0.5 text-xs text-blue-200 truncate max-w-[180px]">{customerName}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-white">{inr(amount, true)}</p>
            <p className="text-xs text-blue-200">{invoiceNumber}</p>
          </div>
        </div>

        {/* Form Stage */}
        {stage === 'form' && (
          <div className="p-5 space-y-4">
            {/* Method Tabs */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-medium">
              {(['upi', 'card', 'netbanking'] as PayMethod[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setTab(m); setError(''); }}
                  className={`flex-1 py-2 transition-colors ${
                    tab === m ? 'bg-[#072654] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m === 'upi' ? 'UPI' : m === 'card' ? 'Card' : 'Netbanking'}
                </button>
              ))}
            </div>

            {/* UPI */}
            {tab === 'upi' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700 flex items-start gap-2">
                  <span>ℹ️</span>
                  <span>Test: use any ID ending in <strong>@upi</strong> e.g. <code className="bg-blue-100 px-1 rounded">test@upi</code></span>
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">UPI ID</span>
                  <input
                    type="text"
                    placeholder="yourname@upi"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#3395FF] focus:outline-none focus:ring-2 focus:ring-[#3395FF]/30"
                  />
                </label>
              </div>
            )}

            {/* Card */}
            {tab === 'card' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700 flex items-start gap-2">
                  <span>🃏</span>
                  <span>Test card: <strong>4111 1111 1111 1111</strong> · CVV <strong>123</strong> · Exp <strong>12/26</strong></span>
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Card Number</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="1234 5678 9012 3456"
                    value={cardNo}
                    onChange={(e) => setCardNo(formatCard(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tracking-widest focus:border-[#3395FF] focus:outline-none focus:ring-2 focus:ring-[#3395FF]/30"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">Expiry</span>
                    <input type="text" inputMode="numeric" placeholder="MM/YY" value={expiry}
                      onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#3395FF] focus:outline-none focus:ring-2 focus:ring-[#3395FF]/30" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">CVV</span>
                    <input type="password" inputMode="numeric" placeholder="&bull;&bull;&bull;" maxLength={4} value={cvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#3395FF] focus:outline-none focus:ring-2 focus:ring-[#3395FF]/30" />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Name on Card</span>
                  <input type="text" placeholder="JOHN DOE" value={cardName}
                    onChange={(e) => setCardName(e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase tracking-wide focus:border-[#3395FF] focus:outline-none focus:ring-2 focus:ring-[#3395FF]/30" />
                </label>
              </div>
            )}

            {/* Netbanking */}
            {tab === 'netbanking' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700 flex items-start gap-2">
                  <span>🏦</span>
                  <span>Select any bank — payment will be simulated successfully.</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {BANKS.map((b) => (
                    <button key={b} type="button" onClick={() => setBank(b)}
                      className={`rounded-lg border px-3 py-2.5 text-xs font-medium text-left transition-all ${
                        bank === b
                          ? 'border-[#3395FF] bg-[#3395FF]/10 text-[#072654] font-semibold'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}>
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">{error}</div>
            )}

            <button onClick={handlePay}
              className="w-full rounded-xl bg-[#3395FF] py-3 text-sm font-bold text-white hover:bg-[#2277e0] transition-colors shadow-lg shadow-blue-200">
              Pay {inr(amount, true)}
            </button>

            <button onClick={onDismiss}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors py-1">
              Cancel payment
            </button>

            <div className="flex items-center justify-center gap-1.5 pt-1 border-t border-slate-100">
              <svg width="10" height="10" viewBox="0 0 36 36" fill="none">
                <path d="M18 0L0 36h13.5L18 24l4.5 12H36L18 0z" fill="#3395FF" opacity="0.7"/>
              </svg>
              <span className="text-[10px] text-slate-400">Secured by Razorpay · Test Mode</span>
            </div>
          </div>
        )}

        {/* Processing Stage */}
        {stage === 'processing' && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-8">
            <div className="relative">
              <div className="h-14 w-14 animate-spin rounded-full border-4 border-slate-200 border-t-[#3395FF]" />
              <svg className="absolute inset-0 m-auto h-6 w-6 text-[#3395FF]" viewBox="0 0 36 36" fill="currentColor">
                <path d="M18 0L0 36h13.5L18 24l4.5 12H36L18 0z"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-800">Processing payment…</p>
              <p className="mt-1 text-xs text-slate-400">Please do not close this window</p>
            </div>
          </div>
        )}

        {/* Success Stage */}
        {stage === 'success' && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 ring-8 ring-green-50">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-slate-900">Payment Successful!</p>
              <p className="mt-1 text-sm text-slate-500">{inr(amount, true)} paid</p>
              <p className="mt-2 text-xs text-slate-400">Updating your records…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
