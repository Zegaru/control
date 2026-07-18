import { createContext, useContext, type ReactNode } from 'react'
import { useDaemonSocket } from './useWs.js'

type SocketApi = ReturnType<typeof useDaemonSocket>

const SocketContext = createContext<SocketApi | null>(null)

export function SocketProvider({ children }: { children: ReactNode }) {
  const socket = useDaemonSocket()
  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
}

export function useSocket(): SocketApi {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}
