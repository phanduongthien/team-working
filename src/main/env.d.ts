/// <reference types="vite/client" />

// Main chỉ nhận URL Supabase (để kiểm tra link đăng nhập), không nhận key.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
