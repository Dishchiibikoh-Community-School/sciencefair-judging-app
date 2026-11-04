import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { Analytics } from '@vercel/analytics/react'
import App from './ScienceFairJudging.jsx'

// Register service worker — enables PWA install prompt and offline caching
registerSW({ immediate: true })

// Last line of defence (2026-11, FIXES_2026-11.md F17): an unexpected render error used to leave a
// blank white page with no way back. Scores, drafts and the offline queue live in localStorage, so a
// reload is safe — say so, and offer it. The error itself still reaches the IT log through the
// window "error" listener in App (CLIENT_ERROR).
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" data-testid="crash-screen" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '1.5rem', fontFamily: 'system-ui, sans-serif', background: '#fff', color: '#1e293b' }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>⚠️</div>
          <h2 style={{ margin: '0 0 .5rem', color: '#1e3a5f' }}>Something went wrong on this screen</h2>
          <p style={{ color: '#475569', lineHeight: 1.5, margin: '0 0 1.25rem' }}>
            Your saved scores and unsent work are safe on this device. Tap Reload to continue.
            If it keeps happening, tell the coordinator.
          </p>
          <button onClick={() => window.location.reload()} style={{ padding: '.8rem 1.6rem', minHeight: 44, border: 0,
            borderRadius: 10, background: '#1e3a5f', color: '#fff', fontSize: '1rem', cursor: 'pointer' }}>Reload</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <Analytics />
  </StrictMode>,
)
