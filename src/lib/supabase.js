import { createClient } from '@supabase/supabase-js'

// Chế độ cloud bật khi có đủ 2 biến môi trường Vercel.
// Không có → app chạy chế độ cũ (Python core qua LAN/tunnel), giữ nguyên.
export const SUPABASE_MODE = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
)

let client = null

export function supabase() {
  if (!SUPABASE_MODE) throw new Error('Chưa cấu hình Supabase (thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY
    )
  }
  return client
}
