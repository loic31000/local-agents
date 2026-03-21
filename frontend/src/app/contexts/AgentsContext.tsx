import { createContext, useContext, useState, useCallback, useEffect, ReactNode, Dispatch, SetStateAction } from 'react'

export interface Agent {
  id: string
  name: string
  description: string
  model: string
  capabilities: string[]
  enabled: boolean
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  agent?: string
  model?: string
  timestamp: Date
  attachment?: {
    name: string
    content: string
    size: number
  }
}

export type ConversationsMap = Record<string, Message[]>

export const WELCOME_MESSAGE = (agentId: string): Message => ({
  id: 'welcome',
  role: 'assistant',
  content: 'Bonjour ! Je suis JARVIS. Pose-moi une question.',
  agent: agentId,
  timestamp: new Date(),
})

interface AgentsContextType {
  agents: Agent[]
  loading: boolean
  error: string | null
  refreshAgents: (showSpinner?: boolean) => Promise<void>
  updateAgent: (updated: Agent) => void
  autoRefresh: boolean
  toggleAutoRefresh: () => void
  // Conversations persistantes entre les pages
  conversations: ConversationsMap
  addMessage: (agentId: string, msg: Message) => void
  resetConversation: (agentId: string) => void
  setConversations: Dispatch<SetStateAction<ConversationsMap>>
}

const AgentsContext = createContext<AgentsContextType | undefined>(undefined)

export function AgentsProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [conversations, setConversations] = useState<ConversationsMap>({})

  const refreshAgents = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const res = await fetch('/api/agents')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: Agent[] = await res.json()
      setAgents(data)
      setError(null)
    } catch {
      setError("Impossible de contacter l'orchestrateur")
    } finally {
      setLoading(false)
    }
  }, [])

  const updateAgent = useCallback((updated: Agent) => {
    setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
  }, [])

  useEffect(() => { refreshAgents() }, [refreshAgents])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => refreshAgents(), 30000)
    return () => clearInterval(interval)
  }, [refreshAgents, autoRefresh])

  const toggleAutoRefresh = () => setAutoRefresh(prev => !prev)

  const addMessage = useCallback((agentId: string, msg: Message) => {
    setConversations(prev => ({
      ...prev,
      [agentId]: [...(prev[agentId] ?? [WELCOME_MESSAGE(agentId)]), msg],
    }))
  }, [])

  const resetConversation = useCallback((agentId: string) => {
    setConversations(prev => {
      const next = { ...prev }
      delete next[agentId]
      return next
    })
  }, [])

  return (
    <AgentsContext.Provider value={{
      agents, loading, error, refreshAgents, updateAgent,
      autoRefresh, toggleAutoRefresh,
      conversations, addMessage, resetConversation, setConversations,
    }}>
      {children}
    </AgentsContext.Provider>
  )
}

export function useAgents() {
  const ctx = useContext(AgentsContext)
  if (!ctx) throw new Error('useAgents must be used within AgentsProvider')
  return ctx
}