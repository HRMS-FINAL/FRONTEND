/**
 * ConfirmDialog — a branded confirmation modal that replaces the
 * browser's bare-bones `window.confirm` everywhere we ask the user to
 * commit to a destructive or irreversible action.
 *
 * Usage
 * ─────
 *   import { useConfirm } from './ConfirmDialog';
 *   ...
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: 'Log out?',
 *     message: "You'll be signed out of HRMS.",
 *     confirmLabel: 'Log out',
 *     destructive: true,
 *   });
 *   if (!ok) return;
 *
 * The hook returns a function that resolves with `true` when the user
 * clicks confirm and `false` on cancel / backdrop click / escape.
 *
 * Mount the provider once near the app root:
 *   <ConfirmDialogProvider> <App /> </ConfirmDialogProvider>
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const Ctx = createContext(null);

export function ConfirmDialogProvider({ children }) {
  const [state, setState] = useState(null);   // { title, message, confirmLabel, cancelLabel, destructive, resolve }

  const open = useCallback(({
    title         = 'Are you sure?',
    message       = '',
    confirmLabel  = 'Confirm',
    cancelLabel   = 'Cancel',
    destructive   = false,
  } = {}) => {
    return new Promise((resolve) => {
      setState({ title, message, confirmLabel, cancelLabel, destructive, resolve });
    });
  }, []);

  const close = (val) => {
    if (state?.resolve) state.resolve(val);
    setState(null);
  };

  // ESC to cancel — only when the dialog is open.
  useEffect(() => {
    if (!state) return;
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter')  close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Focus the confirm button when the dialog opens so the user can hit
  // Enter immediately.
  const confirmBtnRef = useRef(null);
  useEffect(() => {
    if (state) {
      setTimeout(() => confirmBtnRef.current?.focus(), 50);
    }
  }, [state]);

  return (
    <Ctx.Provider value={open}>
      {children}
      {state && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => close(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            animation: 'cd-fade-in 0.18s ease-out',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(420px, 100%)',
              background: '#fff',
              borderRadius: 14,
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              animation: 'cd-pop-in 0.18s ease-out',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              padding: '22px 22px 14px',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                background: state.destructive ? '#FEF2F2' : '#EFF6FF',
                color:      state.destructive ? '#DC2626' : '#1D4ED8',
                fontSize: 22, fontWeight: 800,
              }}>
                {state.destructive ? '!' : '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{
                  margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A',
                  lineHeight: 1.3,
                }}>{state.title}</h3>
                {state.message && (
                  <p style={{
                    margin: '6px 0 0', fontSize: 13, color: '#475569',
                    lineHeight: 1.5, whiteSpace: 'pre-wrap',
                  }}>{state.message}</p>
                )}
              </div>
            </div>

            <div style={{
              padding: '12px 22px 20px',
              display: 'flex', gap: 8, justifyContent: 'flex-end',
              borderTop: '1px solid #F1F5F9',
            }}>
              <button
                type="button"
                onClick={() => close(false)}
                style={{
                  padding: '9px 18px', borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: '#fff', color: '#475569',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}
              >{state.cancelLabel}</button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={() => close(true)}
                style={{
                  padding: '9px 18px', borderRadius: 8,
                  border: 'none',
                  background: state.destructive ? '#DC2626' : '#4CAA17',
                  color: '#fff', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: state.destructive
                    ? '0 1px 3px rgba(220, 38, 38, 0.4)'
                    : '0 1px 3px rgba(76, 170, 23, 0.4)',
                }}
              >{state.confirmLabel}</button>
            </div>
          </div>

          <style>{`
            @keyframes cd-fade-in { from { opacity: 0; } to { opacity: 1; } }
            @keyframes cd-pop-in {
              from { opacity: 0; transform: scale(0.94) translateY(8px); }
              to   { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Hook — returns an async `confirm(opts)` function. */
export function useConfirm() {
  const fn = useContext(Ctx);
  if (!fn) {
    // Fallback: until the provider mounts, fall back to window.confirm
    // so the code still works in tests / isolated screens.
    return ({ title, message } = {}) => Promise.resolve(window.confirm(`${title}\n\n${message || ''}`));
  }
  return fn;
}

export default ConfirmDialogProvider;
