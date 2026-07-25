import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './lib/auth'
import { Fehlergrenze } from './lib/Fehlergrenze'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Fehlergrenze>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Fehlergrenze>
  </React.StrictMode>,
)
