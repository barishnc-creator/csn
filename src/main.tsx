import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './lib/install'
import { captureInviteFromUrl } from './lib/invite'
import { initDesktopTitleBar } from './lib/desktop'

captureInviteFromUrl()
initDesktopTitleBar()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
