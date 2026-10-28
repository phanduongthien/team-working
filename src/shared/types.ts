import type { ChatEvent, ChatMode, ChatUsage, CliStatus } from './ai'
import type { CsvHeaders, TimeEntry } from './timesheet'
import type {
  AiResult,
  AiSettings,
  DayBlock,
  DayPlanRequest,
  LearningPathRequest,
  PlannedStep,
  QuizGrade,
  QuizGradeRequest,
  QuizQuestion,
  QuizRequest,
  ReportRequest,
  TimeEntryKind,
  Workday,
  Appearance,
  AssistantProfile,
  DesktopNotification,
  FeedbackCoachRequest,
  FeedbackSummaryRequest,
  MemoryAction,
  TextResult,
  PlanRequest,
  PlanResult,
  MemoryCategory,
  SuggestionStatus,
  UserProfile
} from './schemas'

export type Conversation = {
  id: string
  title: string
  mode: ChatMode
  pinned: boolean
  /** Chế độ Code: thư mục dự án đã chọn. */
  cwd: string | null
  /** Chế độ Code: người dùng đã bật cho phép sửa file (mỗi lần sửa vẫn phải duyệt). */
  codeWrite: boolean
  createdAt: number
  updatedAt: number
}

export type MessageRole = 'user' | 'assistant'
export type MessageStatus = 'streaming' | 'done' | 'error' | 'aborted'

export type ToolEvent = { name: string; input: unknown }

/** Thông tin file đính kèm renderer được thấy (không có đường dẫn). */
export type Attachment = {
  id: string
  name: string
  mimeType: string
  size: number
}

/** Bản lưu trong main — có đường dẫn file đã copy vào workspace. */
export type StoredAttachment = Attachment & { path: string }

export type Message = {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  status: MessageStatus
  error: string | null
  toolEvents: ToolEvent[]
  attachments: Attachment[]
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

export type Memory = {
  id: string
  content: string
  category: MemoryCategory
  sourceConversationId: string | null
  createdAt: number
  updatedAt: number
  lastUsedAt: number | null
}

export type MemorySuggestion = {
  id: string
  conversationId: string | null
  action: MemoryAction
  targetMemoryId: string | null
  /** Nội dung memory hiện tại (với update/delete) để người dùng so sánh. */
  targetContent: string | null
  content: string
  category: MemoryCategory
  status: SuggestionStatus
  createdAt: number
}

export type ExtractResult = { added: number } | { error: string }

/** Yêu cầu sửa file ở chế độ Code đang chờ người dùng duyệt. */
export type CodeApprovalRequest = {
  id: string
  conversationId: string
  toolName: string
  change: { path: string; isNewFile: boolean; patch: string; added: number; removed: number }
}

/** Sự kiện main → renderer khi danh sách đề xuất memory thay đổi. */
export type MemoryEventPayload =
  | { type: 'suggestions'; pending: number }
  | { type: 'extracting'; conversationId: string; running: boolean }

export type PickAttachmentsResult = { attachments: Attachment[]; rejected: { name: string; reason: string }[] }

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
    send(conversationId: string, text: string, attachmentIds?: string[]): Promise<ChatSendResult>
    abort(requestId: string): Promise<void>
    onEvent(listener: (payload: ChatStreamPayload) => void): () => void
    pickAttachments(): Promise<PickAttachmentsResult>
  }
  memory: {
    getProfile(): Promise<UserProfile>
    setProfile(profile: UserProfile): Promise<UserProfile>
    list(query?: string): Promise<Memory[]>
    create(content: string, category: MemoryCategory): Promise<Memory>
    update(id: string, content: string, category: MemoryCategory): Promise<Memory>
    remove(id: string): Promise<void>
    suggestions(): Promise<MemorySuggestion[]>
    resolve(input: { id: string; accept: boolean; content?: string; category?: MemoryCategory }): Promise<void>
    extract(conversationId: string): Promise<ExtractResult>
    /** Báo đã rời một cuộc trò chuyện — main tự đề xuất memory nếu được bật và có đủ tin mới. */
    conversationLeft(conversationId: string): Promise<void>
    export(): Promise<string | null>
    onEvent(listener: (payload: MemoryEventPayload) => void): () => void
  }
  settings: {
    getAssistant(): Promise<AssistantProfile>
    setAssistant(profile: AssistantProfile): Promise<AssistantProfile>
    getAppearance(): Promise<Appearance>
    setAppearance(appearance: Appearance): Promise<Appearance>
    getAi(): Promise<AiSettings & { hasApiKey: boolean; secureStorage: boolean }>
    setAi(settings: AiSettings): Promise<AiSettings>
    setApiKey(key: string): Promise<void>
    clearApiKey(): Promise<void>
  }
  app: {
    openExternal(url: string): Promise<void>
    /** Main yêu cầu chuyển trang (vd khi bấm thông báo Windows). */
    onNavigate(listener: (route: string) => void): () => void
  }
  auth: {
    /** Mở trình duyệt tới link đăng nhập Supabase và chờ mã trả về qua cổng loopback. */
    oauth(authorizeUrl: string): Promise<{ code: string } | { error: string }>
    cancel(): Promise<void>
  }
  notify: {
    show(notification: DesktopNotification): Promise<void>
  }
  planner: {
    planTasks(request: PlanRequest): Promise<PlanResult>
  }
  feedback: {
    /** Trợ lý viết lại bản nháp feedback / câu trả lời (không tự gửi). */
    coach(request: FeedbackCoachRequest): Promise<TextResult>
    summarize(request: FeedbackSummaryRequest): Promise<TextResult>
  }
  code: {
    /** Mở hộp thoại chọn thư mục dự án cho hội thoại (đổi thư mục → tắt quyền sửa). */
    chooseFolder(conversationId: string): Promise<Conversation | null>
    setWrite(conversationId: string, enabled: boolean): Promise<Conversation>
    respond(id: string, allow: boolean): Promise<void>
    onApproval(listener: (request: CodeApprovalRequest) => void): () => void
  }
  time: {
    current(): Promise<TimeEntry | null>
    start(input: TimeStartInput): Promise<TimeEntry>
    stop(): Promise<TimeEntry | null>
    list(from: number, to: number): Promise<TimeEntry[]>
    addManual(input: TimeManualInput): Promise<TimeEntry>
    update(input: TimeUpdateInput): Promise<TimeEntry>
    remove(id: string): Promise<void>
    exportCsv(input: { from: number; to: number; headers: CsvHeaders; kinds: Record<TimeEntryKind, string> }): Promise<string | null>
    onChanged(listener: () => void): () => void
    getWorkday(): Promise<Workday>
    setWorkday(workday: Workday): Promise<Workday>
  }
  learning: {
    planPath(request: LearningPathRequest): Promise<AiResult<{ steps: PlannedStep[] }>>
    makeQuiz(request: QuizRequest): Promise<AiResult<{ questions: QuizQuestion[] }>>
    grade(request: QuizGradeRequest): Promise<AiResult<QuizGrade>>
    /** Đề xuất memory (vào hàng chờ duyệt, không tự lưu). */
    suggestMemory(content: string, category: MemoryCategory): Promise<void>
  }
  dayPlanner: {
    plan(request: DayPlanRequest): Promise<AiResult<{ blocks: DayBlock[] }>>
    report(request: ReportRequest): Promise<TextResult>
  }
}

export type TimeStartInput = { taskId?: string | null; projectId?: string | null; title: string; projectName?: string | null; kind?: 'timer' | 'pomodoro' }
export type TimeManualInput = { taskId?: string | null; projectId?: string | null; title: string; projectName?: string | null; startedAt: number; endedAt: number; note?: string }
export type TimeUpdateInput = { id: string; title: string; note: string; startedAt: number; endedAt: number }
