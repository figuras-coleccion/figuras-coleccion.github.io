import { installQrTradeUi } from './qr-trade-ui.js'
import { startQrGuestFlow } from './qr-guest-flow.js'
import { startQrGuestRecovery } from './qr-guest-recovery.js'
import { startQrHostFallback } from './qr-host-fallback.js'
import './qr-confirm-bridge.js'
import './qr-upload-reader.js'
import './qr-match-layout-fixes.js'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { UserProvider, useUser } from './context/UserContext'
import { EditLockProvider } from './context/EditLockContext'
import { StickersProvider } from './context/StickersContext'
import Layout from './components/Layout'
import Register from './components/Register'
import DashboardWithRecent from './components/DashboardWithRecent'
import AlbumPage from './components/AlbumPage'
import TeamPage from './components/TeamPage'
import SpecialsPage from './components/SpecialsPage'
import ExtrasPage from './components/ExtrasPage'
import MatchFinder from './components/MatchFinder'
import TradeHub from './components/TradeHub'
import ProfilePage from './components/ProfilePage'
import SettingsPage from './components/SettingsPage'
import VisualMissingReportSafe from './components/VisualMissingReportSafe'
import AdminDashboard from './components/AdminDashboard'

installQrTradeUi()
startQrGuestFlow()
startQrGuestRecovery()
startQrHostFallback()

const routerBasename = import.meta.env.BASE_URL === '/'
  ? '/'
  : import.meta.env.BASE_URL.replace(/\/$/, '')

function AppRoutes() {
  const { user } = useUser()

  if (!user) return <Register />

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardWithRecent />} />
        <Route path="album" element={<AlbumPage />} />
        <Route path="team/:teamCode" element={<TeamPage />} />
        <Route path="specials" element={<SpecialsPage />} />
        <Route path="extras" element={<ExtrasPage />} />
        <Route path="trade" element={<TradeHub />} />
        <Route path="matches" element={<MatchFinder />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="visual-report" element={<VisualMissingReportSafe />} />
        <Route path="admin" element={<AdminDashboard />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <UserProvider>
        <EditLockProvider>
          <StickersProvider>
            <AppRoutes />
          </StickersProvider>
        </EditLockProvider>
      </UserProvider>
    </BrowserRouter>
  )
}
