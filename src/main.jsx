import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
// ConfirmDialogProvider mounts the branded confirmation modal at the
// root so any deeply-nested page can call `useConfirm()` to prompt
// the user without reaching for window.confirm.
import { ConfirmDialogProvider } from './components/ConfirmDialog.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfirmDialogProvider>
      <App />
    </ConfirmDialogProvider>
  </StrictMode>,
)
