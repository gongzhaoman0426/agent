import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import App from './App.tsx'
import { queryClient } from './lib/query-client'
import { SidebarProvider } from './hooks/use-sidebar'
import { AuthProvider } from './hooks/use-auth'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Toaster } from './ui/components/toaster'
import "@/ui/styles/globals.css"

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <SidebarProvider>
              <App />
              <Toaster />
              <ReactQueryDevtools initialIsOpen={false} />
            </SidebarProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
