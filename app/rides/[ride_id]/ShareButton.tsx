'use client';

// Share button for a ride. Tries the native Web Share API first (best on
// mobile — opens the OS share sheet with email/text/messages built in), and
// falls back to a small popover with explicit Email / Text / Copy actions.

import { useEffect, useRef, useState } from 'react';

type Props = {
  rideId: string;
  title: string;
  instructor?: string | null;
  className?: string;
};

export default function ShareButton({
  rideId,
  title,
  instructor,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/rides/${rideId}`
      : `/rides/${rideId}`;
  const subject = title;
  const body = `${title}${instructor ? ` with ${instructor}` : ''}\n\n${url}`;
  const smsBody = `${title}${instructor ? ` with ${instructor}` : ''} ${url}`;

  const mailto = `mailto:?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
  const sms = `sms:?&body=${encodeURIComponent(smsBody)}`;

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: body, url });
        return;
      } catch (err) {
        // User cancelled or sharing failed — fall through to popover.
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    setOpen((v) => !v);
  }

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore — fallback link is still visible.
    }
  }

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Share ride"
        title="Share"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-gray-500 hover:bg-purple-50 hover:text-purple-600 border border-gray-100 shadow-sm transition-colors"
      >
        <ShareIcon />
      </button>

      {open && (
        <div
          onClick={stop}
          className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-gray-100 bg-white shadow-lg py-1 text-sm"
        >
          <a
            href={mailto}
            onClick={stop}
            className="block px-3 py-2 text-gray-700 hover:bg-gray-50"
          >
            Email
          </a>
          <a
            href={sms}
            onClick={stop}
            className="block px-3 py-2 text-gray-700 hover:bg-gray-50"
          >
            Text message
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
