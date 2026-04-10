// src/App.jsx
import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import HomePage from './pages/HomePage'
import DashboardPage from './pages/DashboardPage'
import VaultPage from './pages/VaultPage'
import CompareApyPage from './pages/CompareApyPage'

function AuthGuard({ children }) {
  const { isConnected } = useAccount()
  if (!isConnected) return <Navigate to="/" replace />
  return children
}

function HomeRedirect() {
  const { isConnected } = useAccount()
  const navigate = useNavigate()

  useEffect(() => {
    if (isConnected) {
      navigate('/dashboard', { replace: true })
    }
  }, [isConnected, navigate])

  return <HomePage />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/dashboard" element={
        <AuthGuard><DashboardPage /></AuthGuard>
      } />
      <Route path="/vaults" element={
        <AuthGuard><VaultPage /></AuthGuard>
      } />
      <Route path="/compare" element={
        <AuthGuard><CompareApyPage /></AuthGuard>
      } />
    </Routes>
  )
}