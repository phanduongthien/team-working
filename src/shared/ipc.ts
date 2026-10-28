/** Tên kênh IPC — dùng chung main/preload để không gõ sai. */
export const IPC = {
  cliCheck: 'cli:check',
  conversationsList: 'conversations:list',
  conversationsCreate: 'conversations:create',
  conversationsUpdate: 'conversations:update',
  conversationsRemove: 'conversations:remove',
  messagesList: 'messages:list',
  chatSend: 'chat:send',
  chatAbort: 'chat:abort',
  chatEvent: 'chat:event',
  settingsGetAssistant: 'settings:getAssistant',
  settingsSetAssistant: 'settings:setAssistant',
  settingsGetAppearance: 'settings:getAppearance',
  settingsSetAppearance: 'settings:setAppearance',
  appOpenExternal: 'app:openExternal'
} as const
