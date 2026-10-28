import type { ChatEvent, ChatMode, ChatUsage, CliStatus } from './ai'
import type { Appearance, AssistantProfile } from './schemas'

export type Conversation = {
  id: string
  title: string
  mode: ChatMode
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export type MessageRole = 'user' | 'assistant'
export type MessageStatus = 'streaming' | 'done' | 'error' | 'aborted'

export type ToolEvent = { name: string; input: unknown }

export type Message = {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  status: MessageStatus
  error: string | null
  toolEvents: ToolEvent[]
  usage: ChatUsage | null
  createdAt: number
}

export type ChatSendResult = {
  requestId: string
  userMessage: Message
  assistantMessage: Message
}

/** Gói sự kiện main → renderer trên kênh `chat:event`. */
export type ChatStreamPayload = {
  requestId: string
  conversationId: string
  messageId: string
  event: ChatEvent
}

export type ConversationUpdate = {
  id: string
  title?: string
  pinned?: boolean
  mode?: ChatMode
}

/** API có kiểu mà preload expose tại `window.api`. */
export interface TeamWorkingApi {
  cli: {
    check(): Promise<CliStatus>
  }
  conversations: {
    list(query?: string): Promise<Conversation[]>
    create(mode?: ChatMode): Promise<Conversation>
    update(input: ConversationUpdate): Promise<Conversation>
    remove(id: string): Promise<void>
  }
  messages: {
    list(conversationId: string): Promise<Message[]>
  }
  chat: {
    send(conversationId: string, text: string): Promise<ChatSendResult>
    abort(requestId: string): Promise<void>
    onEvent(listener: (payload: ChatStreamPayload) => void): () => void
  }
  settings: {
    getAssistant(): Promise<AssistantProfile>
    setAssistant(profile: AssistantProfile): Promise<AssistantProfile>
    getAppearance(): Promise<Appearance>
    setAppearance(appearance: Appearance): Promise<Appearance>
  }
  app: {
    openExternal(url: string): Promise<void>
  }
}
