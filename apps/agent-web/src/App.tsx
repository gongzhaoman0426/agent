import { Routes, Route, Navigate } from 'react-router-dom'
import { ChatLayout } from './components/chat/ChatLayout'
import { ManageLayout } from './components/manage/ManageLayout'
import { Agents } from './pages/Agents'
import { Toolkits } from './pages/Toolkits'
import { Workflows } from './pages/Workflows'
import { KnowledgeBases } from './pages/KnowledgeBases'
import { Login } from './pages/Login'
import { useAuth } from './hooks/use-auth'
import type { ReactNode } from 'react'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/chat/:sessionId?" element={<ProtectedRoute><ChatLayout /></ProtectedRoute>} />
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route element={<ProtectedRoute><ManageLayout /></ProtectedRoute>}>
        <Route path="/manage/agents" element={<Agents />} />
        <Route path="/manage/toolkits" element={<Toolkits />} />
        <Route path="/manage/workflows" element={<Workflows />} />
        <Route path="/manage/knowledge-bases" element={<KnowledgeBases />} />
      </Route>
    </Routes>
  )
}

export default App
