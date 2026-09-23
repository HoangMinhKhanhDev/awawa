import { Component } from 'react'

// Bắt lỗi render-time: thay vì trắng màn hình, hiện thẻ báo lỗi + nút tải lại.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { err: null }
  }
  static getDerivedStateFromError(err) {
    return { err }
  }
  componentDidCatch(err, info) {
    try { console.error('App render error:', err, info) } catch {}
  }
  render() {
    if (this.state.err) {
      return (
        <div className="grid" style={{ padding: 24, maxWidth: 560, margin: '40px auto' }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Màn hình gặp lỗi</h2>
            <div className="msg err" role="alert" style={{ marginBottom: 12 }}>
              {String(this.state.err?.message || this.state.err || 'Lỗi không rõ').slice(0, 300)}
            </div>
            <div className="row">
              <button className="btn primary" onClick={() => window.location.reload()}>Tải lại trang</button>
              <button className="btn" onClick={() => this.setState({ err: null })}>Thử lại</button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
