import type { Artifact, ArtifactVersion, MessageArtifact } from './artifacts'
import type { MessageVoice, SpeakChunk, TranscribeResult, VoiceComponent, VoicePackState, VoiceSettings, VoiceStatus } from './voice'
import type { SkillDetail, SkillInfo, SkillPreviewResult, SkillSource, StyleLearnResult } from './skills'
import type {
  ExpressiveSettings,
  ExpressiveStatus,
  MediaItem,
  MediaKind,
  MediaRef,
  MediaSearchResult,
  MessageMedia,
  Reaction
} from './expressive'
import type { ChatEvent, ChatMode, ChatUsage, CliStatus } from './ai'
import type {
  AgentExchange,
  AgentNotice,
  AgentServerStatus,
  McpApprovalDecision,
  McpApprovalRequest,
  McpServerInfo,
  NewAgentToken
} from './agents'
import type { ComputerStatus, ScreenPreview } from './computer'
import type { SidecarState } from './sidecar'
import type {
  DraftApprovalRequest,
  DraftDecision,
  GmailAccountUpdate,
  GmailPreviewItem,
  GmailStatus,
  TelegramChatInfo,
  TelegramMode,
  TelegramStatus
} from './connectors'
import type { CsvHeaders, TimeEntry } from './timesheet'
import type { UpdateState } from './update'
import type {
  AccountSession,
  SavedAccountInfo,
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
  UpdateSettings,
  McpServerInput,
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
  /** Thumbnail (data URL) trả về lúc vừa thêm ảnh — chỉ dùng ở khung soạn tin, không lưu DB. */
  thumbnail?: string
}

/** Bản lưu trong main — có đường dẫn file đã copy vào workspace. */
export type StoredAttachment = Attachment & {
  path: string
  /** Bản thu nhỏ gửi cho Claude khi ảnh gốc vượt giới hạn (bản gốc vẫn là `path`). */
  modelPath?: string
  modelMimeType?: string
}

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
  /** Cảm xúc đã thả (mỗi bên tối đa 1). */
  reactions: Reaction[]
  /** GIF / sticker kèm tin. */
  media: MessageMedia | null
  /** Tin gửi bằng giọng nói (chữ do máy chép lại) + ghi âm gốc. */
  voice: MessageVoice | null
  /** Artifact tạo / sửa trong câu trả lời này. */
  artifacts: MessageArtifact[]
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

export type PickAttachmentsResult = {
  attachments: Attachment[]
  rejected: { name: string; reason: string }[]
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
    send(conversationId: string, text: string, attachmentIds?: string[]): Promise<ChatSendResult>
    abort(requestId: string): Promise<void>
    onEvent(listener: (payload: ChatStreamPayload) => void): () => void
    pickAttachments(): Promise<PickAttachmentsResult>
    /** Thêm một file từ kéo thả / dán (gửi nội dung, không gửi đường dẫn). */
    addFile(name: string, data: Uint8Array): Promise<PickAttachmentsResult>
    /** Ctrl+V khi trình duyệt không đưa ra file: main đọc ảnh / file trong clipboard của Windows. */
    pasteClipboard(): Promise<PickAttachmentsResult>
    /** Ảnh xem trước (data URL); null nếu không phải ảnh hoặc không có quyền xem. */
    attachmentPreview(id: string, size: 'thumb' | 'large'): Promise<string | null>
    /** Gửi GIF / sticker (chỉ id; có thể kèm chữ). */
    sendMedia(conversationId: string, text: string, media: MediaRef): Promise<ChatSendResult>
    /** Gửi chữ chép từ giọng nói (đánh dấu "🎤 nói"). */
    sendVoice(conversationId: string, text: string, voice: MessageVoice): Promise<ChatSendResult>
    /** Thả cảm xúc (null = bỏ). Mỗi người tối đa 1 cảm xúc mỗi tin. */
    react(messageId: string, emoji: string | null): Promise<Message>
  }
  skills: {
    /** Skill người dùng cài + skill có sẵn của app (chỉ xem). */
    list(): Promise<SkillInfo[]>
    get(source: SkillSource, name: string): Promise<SkillDetail | null>
    /** Chọn thư mục / file .zip → bản xem trước (chưa cài). null = huỷ chọn. */
    pick(kind: 'folder' | 'zip'): Promise<SkillPreviewResult>
    /** Cài đúng gói đã xem trước. */
    install(token: string): Promise<SkillInfo>
    cancelPreview(token: string): Promise<void>
    remove(name: string): Promise<void>
    setEnabled(name: string, enabled: boolean): Promise<void>
    openFolder(): Promise<void>
    /** Ghi chú trong skill my-style. */
    styleNotes(): Promise<string[]>
    /** Ghi lại toàn bộ ghi chú my-style (đã được người dùng duyệt). Rỗng = xoá skill. */
    setStyleNotes(notes: string[]): Promise<void>
    /** Nhờ trợ lý đọc hội thoại gần đây và ĐỀ XUẤT ghi chú phong cách — không tự lưu. */
    learnStyle(): Promise<StyleLearnResult>
  }
  voice: {
    status(): Promise<VoiceStatus>
    setSettings(value: VoiceSettings): Promise<VoiceStatus>
    /** Tải một phần của gói giọng nói (thư viện / CUDA / model) — chỉ khi người dùng bấm. */
    install(component: VoiceComponent): Promise<VoiceStatus>
    cancel(): Promise<void>
    removeModel(component: Exclude<VoiceComponent, 'packages' | 'cuda'>): Promise<VoiceStatus>
    /** WAV 16 kHz mono từ micro → chữ (ghi âm gốc giữ 7 ngày trên máy). */
    transcribe(wav: Uint8Array, durationMs: number): Promise<TranscribeResult>
    /** Đọc một câu → data URL âm thanh. */
    speak(text: string): Promise<SpeakChunk>
    /** Đang đọc: giữ phím dừng khẩn cấp Ctrl+Alt+Q để dừng đọc. */
    setSpeaking(on: boolean): Promise<void>
    recording(id: string): Promise<string | null>
    onPack(listener: (state: VoicePackState) => void): () => void
    /** Ctrl+Alt+Q → dừng đọc. */
    onStop(listener: () => void): () => void
  }
  artifacts: {
    list(conversationId: string): Promise<Artifact[]>
    versions(id: string): Promise<Omit<ArtifactVersion, 'content'>[]>
    content(id: string, version?: number): Promise<{ artifact: Artifact; version: ArtifactVersion } | null>
    /** Người dùng sửa (vd ô trong bảng) → phiên bản mới. */
    saveVersion(id: string, content: string): Promise<Artifact | null>
    restore(id: string, version: number): Promise<Artifact | null>
    /** Xuất ra file — hộp thoại Lưu của Windows. */
    export(id: string, version: number, format: string): Promise<{ path: string } | { canceled: true } | { error: string }>
    templates(): Promise<{ id: string; name: string; prompt: string }[]>
  }
  expressive: {
    status(): Promise<ExpressiveStatus>
    setSettings(value: ExpressiveSettings): Promise<ExpressiveStatus>
    resetAuto(): Promise<ExpressiveStatus>
    /** Key GIPHY của người dùng (mã hoá DPAPI); null = xoá. Key không bao giờ quay về renderer. */
    setGiphyKey(key: string | null): Promise<ExpressiveStatus | { error: string }>
    /** Tìm GIF / sticker GIPHY; query rỗng = thịnh hành. */
    search(kind: MediaKind, query: string, offset?: number): Promise<MediaSearchResult>
    stickers(): Promise<MediaItem[]>
    stickerData(id: string): Promise<string | null>
    openStickersFolder(): Promise<void>
    favorites(): Promise<{ refs: MediaRef[]; items: MediaItem[] }>
    toggleFavorite(ref: MediaRef): Promise<MediaRef[]>
  }
  memory: {
    getProfile(): Promise<UserProfile>
    setProfile(profile: UserProfile): Promise<UserProfile>
    list(query?: string): Promise<Memory[]>
    create(content: string, category: MemoryCategory): Promise<Memory>
    update(id: string, content: string, category: MemoryCategory): Promise<Memory>
    remove(id: string): Promise<void>
    suggestions(): Promise<MemorySuggestion[]>
    resolve(input: {
      id: string
      accept: boolean
      content?: string
      category?: MemoryCategory
    }): Promise<void>
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
  update: {
    getState(): Promise<UpdateState>
    onState(listener: (state: UpdateState) => void): () => void
    /** Kiểm tra ngay (người dùng bấm) — hiện kết quả kể cả khi đã bỏ qua phiên bản đó. */
    check(): Promise<void>
    download(): Promise<void>
    /** Để sau: bản thường nhắc lại lần mở app sau; bản [critical] nhắc ở lần kiểm tra kế tiếp. */
    postpone(): Promise<void>
    /** Không nhắc lại phiên bản này (không áp dụng cho bản [critical]). */
    skip(): Promise<void>
    /** Khởi động lại để cài bản đã tải. */
    install(): Promise<void>
    getSettings(): Promise<UpdateSettings & { currentVersion: string }>
    setSettings(settings: UpdateSettings): Promise<UpdateSettings>
  }
  app: {
    openExternal(url: string): Promise<void>
    /** Main yêu cầu chuyển trang (vd khi bấm thông báo Windows). */
    onNavigate(listener: (route: string) => void): () => void
    /** Ghi lỗi của giao diện vào file log. */
    logError(message: string): Promise<void>
    /** Phiên bản, hệ điều hành, đoạn cuối log (đã che đường dẫn/email) cho báo lỗi. */
    bugInfo(): Promise<{ version: string; os: string; logTail: string }>
  }
  computer: {
    status(): Promise<ComputerStatus>
    onStatus(listener: (status: ComputerStatus) => void): () => void
    /** Bật lần đầu phải kèm acceptWarning (người dùng đã đọc cảnh báo). */
    setEnabled(
      enabled: boolean,
      acceptWarning?: boolean
    ): Promise<ComputerStatus | { error: string }>
    /** Cho trợ lý xem màn hình trong phiên này (tắt khi khởi động lại app hoặc dừng khẩn cấp). */
    setScreenAccess(on: boolean): Promise<ComputerStatus | { error: string }>
    emergencyStop(): Promise<void>
    /** Chụp thử tại máy (không gửi cho Claude) để xem trợ lý sẽ thấy gì. */
    preview(display?: number): Promise<ScreenPreview | { error: string }>
    openLogs(): Promise<void>
  }
  agents: {
    status(): Promise<AgentServerStatus>
    onStatus(listener: (s: AgentServerStatus) => void): () => void
    onNotice(listener: (n: AgentNotice) => void): () => void
    setEnabled(on: boolean): Promise<AgentServerStatus | { error: string }>
    setLimits(limits: { perHour: number; concurrency: number }): Promise<AgentServerStatus>
    /** Token chỉ trả về đúng lần tạo này. */
    createClient(name: string): Promise<NewAgentToken>
    revoke(clientId: string): Promise<AgentServerStatus>
    respondPairing(clientId: string, allow: boolean): Promise<AgentServerStatus>
    /** Ngắt mọi kết nối (như Ctrl+Alt+Q). */
    stopAll(): Promise<void>
    exchanges(): Promise<AgentExchange[]>
  }
  mcp: {
    list(): Promise<McpServerInfo[]>
    save(input: McpServerInput): Promise<McpServerInfo | { error: string }>
    remove(id: string): Promise<void>
    setEnabled(id: string, enabled: boolean): Promise<void>
    revokeAlways(id: string, tool: string): Promise<void>
    onApproval(listener: (req: McpApprovalRequest) => void): () => void
    respond(id: string, decision: McpApprovalDecision): Promise<boolean>
  }
  sidecar: {
    state(): Promise<SidecarState>
    onState(listener: (state: SidecarState) => void): () => void
    /** Bắt đầu tải + cài (chạy nền); theo dõi qua onState. */
    install(): Promise<SidecarState | { error: string }>
    cancel(): Promise<void>
    /** Gỡ sạch uv, Python, thư viện. */
    uninstall(): Promise<SidecarState | { error: string }>
    /** Thử đọc danh sách cửa sổ tại máy (không gửi cho Claude). */
    check(): Promise<{ windows: number; python: string } | { error: string }>
  }
  /** Gmail cá nhân (thử nghiệm, mặc định tắt): chỉ đọc + tạo nháp sau khi duyệt. Secret không bao giờ về renderer. */
  gmail: {
    status(): Promise<GmailStatus>
    onStatus(listener: (status: GmailStatus) => void): () => void
    setEnabled(enabled: boolean): Promise<GmailStatus | { error: string }>
    /** clientSecret bỏ trống = giữ secret đã lưu. */
    setCredentials(input: { clientId: string; clientSecret?: string }): Promise<GmailStatus | { error: string }>
    setOptions(input: { testingMode: boolean }): Promise<GmailStatus | { error: string }>
    /** Tên gọi, bật/tắt cho trợ lý đọc, lọc riêng tư của một tài khoản. */
    updateAccount(input: GmailAccountUpdate): Promise<GmailStatus | { error: string }>
    /** Mở trình duyệt đăng nhập Google; chờ tới khi xong / huỷ / hết 5 phút. Không id = thêm tài khoản mới. */
    connect(accountId?: string): Promise<GmailStatus | { error: string }>
    cancelConnect(): Promise<void | { error: string }>
    /** Ngắt một tài khoản: thu hồi + xoá token trên máy, bỏ khỏi danh sách. */
    disconnect(accountId: string): Promise<GmailStatus | { error: string }>
    /** 5 thư mới nhất của một tài khoản, tại máy (không gửi cho Claude). */
    preview(accountId: string): Promise<GmailPreviewItem[] | { error: string }>
  }
  /** Telegram tài khoản cá nhân qua GramJS (thử nghiệm, mặc định tắt): chỉ đọc + lưu nháp sau khi duyệt. */
  telegram: {
    status(): Promise<TelegramStatus>
    onStatus(listener: (status: TelegramStatus) => void): () => void
    setEnabled(enabled: boolean): Promise<TelegramStatus | { error: string }>
    /** apiHash bỏ trống = giữ hash đã lưu. */
    setCredentials(input: { apiId: number; apiHash?: string }): Promise<TelegramStatus | { error: string }>
    sendCode(phone: string): Promise<TelegramStatus | { error: string }>
    signIn(code: string): Promise<TelegramStatus | { error: string }>
    password(password: string): Promise<TelegramStatus | { error: string }>
    cancelLogin(): Promise<TelegramStatus | { error: string }>
    /** Đăng xuất phía Telegram + xoá session trên máy. */
    logout(): Promise<TelegramStatus | { error: string }>
    /** force = tải lại ngay (tối đa 1 lần/phút); mặc định dùng bản lưu tạm 15 phút. */
    chats(force?: boolean): Promise<TelegramChatInfo[] | { error: string }>
    setLists(input: { mode: TelegramMode; allow: string[]; block: string[] }): Promise<TelegramStatus | { error: string }>
  }
  /** Bản nháp trợ lý đề xuất (Gmail / Telegram) chờ người dùng duyệt. */
  drafts: {
    onApproval(listener: (req: DraftApprovalRequest | { id: string; closed: true }) => void): () => void
    respond(decision: DraftDecision): Promise<boolean>
  }
  ideas: {
    /** Trợ lý chuẩn hóa ý tưởng/báo lỗi thành GitHub issue (bản nháp để người dùng sửa). */
    format(input: {
      title: string
      description: string
      kind: 'idea' | 'bug'
      language: 'vi' | 'en'
    }): Promise<AiResult<{ title: string; body: string; labels: string[] }>>
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
    exportCsv(input: {
      from: number
      to: number
      headers: CsvHeaders
      kinds: Record<TimeEntryKind, string>
    }): Promise<string | null>
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
  account: {
    /** Báo main tài khoản đang đăng nhập (null = đăng xuất) — trí nhớ/hồ sơ đổi theo. */
    set(uid: string | null): Promise<{ owner: string; claimed: boolean }>
  }
  accounts: {
    /** Tài khoản từng đăng nhập trên máy, mới dùng gần nhất trước. */
    list(): Promise<SavedAccount[]>
    /** Sau mỗi lần đăng nhập/làm mới phiên: cập nhật thông tin (và phiên nếu đang ghi nhớ). */
    record(account: SavedAccountInfo, session: AccountSession): Promise<void>
    /** Bật/tắt "ghi nhớ đăng nhập" cho tài khoản (bật thì cần phiên hiện tại). */
    remember(id: string, remember: boolean, session?: AccountSession): Promise<void>
    /** Phiên đã lưu để đổi nhanh (null nếu không ghi nhớ). */
    session(id: string): Promise<AccountSession | null>
    /** Phiên đã lưu không còn dùng được (đăng xuất / hết hạn) → xóa, giữ tài khoản trong danh sách. */
    dropSession(id: string): Promise<void>
    forget(id: string): Promise<void>
  }
}

export type SavedAccount = SavedAccountInfo & { remembered: boolean; lastUsedAt: number }

export type TimeStartInput = {
  taskId?: string | null
  projectId?: string | null
  title: string
  projectName?: string | null
  kind?: 'timer' | 'pomodoro'
}
export type TimeManualInput = {
  taskId?: string | null
  projectId?: string | null
  title: string
  projectName?: string | null
  startedAt: number
  endedAt: number
  note?: string
}
export type TimeUpdateInput = {
  id: string
  title: string
  note: string
  startedAt: number
  endedAt: number
}
