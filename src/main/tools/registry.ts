import { z } from 'zod'

/** Nội dung trả về cho Claude theo định dạng MCP. */
export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: 'image/png' | 'image/jpeg' }
export type ToolResult = { content: ToolContent[]; isError?: boolean }
export type ToolContext = { conversationId: string }

export type AppTool<S extends z.ZodType = z.ZodType> = {
  /** Tên ngắn (a-z, _), CLI thấy là mcp__mmc__<name>. */
  name: string
  description: string
  input: S
  /** Có cung cấp tool cho lượt chat này không (tính năng bật, đã cho phép…). Kiểm tra lại ở mỗi lần gọi. */
  available(ctx: ToolContext): boolean
  run(input: z.infer<S>, ctx: ToolContext): Promise<ToolResult>
}

export type ToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown> }

const NAME = /^[a-z][a-z0-9_]{0,40}$/

export const errorResult = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true })

/**
 * Tool của app mà Claude (qua CLI) gọi được. Mọi lần gọi đi qua đây: kiểm tra tool còn được phép,
 * validate input bằng zod, bắt lỗi — script MCP chỉ là ống dẫn, không tự quyết định gì.
 */
export class AppToolRegistry {
  private tools = new Map<string, AppTool>()

  register<S extends z.ZodType>(tool: AppTool<S>): void {
    if (!NAME.test(tool.name)) throw new Error(`Tên tool không hợp lệ: ${tool.name}`)
    if (this.tools.has(tool.name)) throw new Error(`Tool đã đăng ký: ${tool.name}`)
    this.tools.set(tool.name, tool as unknown as AppTool)
  }

  /** Tên các tool dùng được trong ngữ cảnh này. */
  available(ctx: ToolContext): string[] {
    return [...this.tools.values()].filter((t) => t.available(ctx)).map((t) => t.name)
  }

  definitions(ctx: ToolContext): ToolDefinition[] {
    return [...this.tools.values()]
      .filter((t) => t.available(ctx))
      .map((t) => {
        const { $schema: _schema, ...inputSchema } = z.toJSONSchema(t.input) as Record<string, unknown>
        return { name: t.name, description: t.description, inputSchema }
      })
  }

  async call(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) return errorResult(`Không có công cụ "${name}".`)
    // Tính năng có thể vừa bị tắt (vd dừng khẩn cấp) giữa lúc CLI đang chạy.
    if (!tool.available(ctx)) return errorResult('Công cụ này đang bị tắt. Hãy dừng và hỏi người dùng.')
    const parsed = tool.input.safeParse(rawInput ?? {})
    if (!parsed.success) return errorResult(`Tham số không hợp lệ: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
    try {
      return await tool.run(parsed.data, ctx)
    } catch (err) {
      return errorResult(`Lỗi khi chạy công cụ: ${(err as Error).message}`)
    }
  }
}
