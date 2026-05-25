import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AcceptInvitePage from './pages/AcceptInvitePage.jsx'
import TeleworkLanding from './pages/TeleworkLanding.jsx'
import AuthPage from './pages/AuthPage.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { ProjectProvider } from './contexts/ProjectContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ProjectProvider>
            <Routes>
              <Route path="/" element={<App />} />
              <Route path="/app" element={<App />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/invite/:token" element={<AcceptInvitePage />} />
              <Route path="/telework" element={<TeleworkLanding />} />
            </Routes>
          </ProjectProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)