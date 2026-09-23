// Hệ thống thông báo & hộp xác nhận in-app — thay alert/confirm/prompt.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const UIContext = createContext(null)

export function errMsg(e) {
  const m = String(e?.message || e || 'Có lỗi xảy ra')
  return m.replace(/^API \d+: /, '').replace(/^Upload lỗi \d+: /, '')
}

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const [promptState, setPromptState] = useState(null)
  const idRef = useRef(0)
  const confirmCb = useRef(null)
  const promptCb = useRef(null)

  const toast = useCallback((msg, type = 'ok') => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, msg: String(msg || ''), type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  const confirmBox = useCallback((msg, opts = {}) => {
    return new Promise((resolve) => {
      confirmCb.current = resolve
      setConfirmState({ msg: String(msg), title: opts.title || 'Xác nhận', danger: !!opts.danger, okLabel: opts.okLabel || 'Xác nhận' })
    })
  }, [])

  const resolveConfirm = (v) => {
    setConfirmState(null)
    confirmCb.current?.(v)
    confirmCb.current = null
  }

  const promptBox = useCallback((msg, opts = {}) => {
    return new Promise((resolve) => {
      promptCb.current = resolve
      setPromptState({
        msg: String(msg),
        title: opts.title || 'Nhập giá trị',
        placeholder: opts.placeholder || '',
        value: opts.value || '',
        type: opts.type || 'text',
        okLabel: opts.okLabel || 'Lưu',
        minLength: opts.minLength || 0,
      })
    })
  }, [])

  const resolvePrompt = (v) => {
    setPromptState(null)
    promptCb.current?.(v)
    promptCb.current = null
  }

  useEffect(() => {
    if (!confirmState && !promptState) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (promptState) resolvePrompt(null)
        else if (confirmState) resolveConfirm(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <UIContext.Provider value={{ toast, confirmBox, promptBox, errMsg }}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="toast-dot" aria-hidden="true" />
            {t.msg}
          </div>
        ))}
      </div>
      {confirmState && (
        <div className="modal-backdrop" onClick={() => resolveConfirm(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-label={confirmState.title} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{confirmState.title}</div>
            <p className="modal-body">{confirmState.msg}</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => resolveConfirm(false)}>Hủy</button>
              <button className={`btn ${confirmState.danger ? 'danger' : 'primary'}`} onClick={() => resolveConfirm(true)} autoFocus>
                {confirmState.okLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      {promptState && <PromptModal state={promptState} onResolve={resolvePrompt} />}
    </UIContext.Provider>
  )
}

function PromptModal({ state, onResolve }) {
  const [val, setVal] = useState(state.value)
  const [err, setErr] = useState('')
  const ok = () => {
    if (state.minLength && val.length < state.minLength) {
      setErr(`Tối thiểu ${state.minLength} ký tự.`)
      return
    }
    onResolve(val)
  }
  return (
    <div className="modal-backdrop" onClick={() => onResolve(null)}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={state.title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{state.title}</div>
        <p className="modal-body">{state.msg}</p>
        <input
          className="input"
          type={state.type}
          value={val}
          placeholder={state.placeholder}
          autoFocus
          onChange={(e) => { setVal(e.target.value); setErr('') }}
          onKeyDown={(e) => e.key === 'Enter' && ok()}
        />
        {err && <div className="msg err" role="alert">{err}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={() => onResolve(null)}>Hủy</button>
          <button className="btn primary" onClick={ok}>{state.okLabel}</button>
        </div>
      </div>
    </div>
  )
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) {
    // Fallback an toàn nếu dùng ngoài provider
    return {
      toast: (m) => { try { console.warn('toast ngoài provider:', m) } catch {} },
      confirmBox: async () => window.confirm('Bạn chắc chứ?'),
      promptBox: async () => window.prompt(''),
      errMsg,
    }
  }
  return ctx
}
