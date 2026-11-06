import { useEffect } from 'react'

/**
 * Gọi `refresh` khi trang mở và mỗi lần cửa sổ app được focus / hiện lại (vd quay về sau khi đăng nhập
 * trên trình duyệt). Trang cài đặt không chỉ dựa vào sự kiện từ main — lỡ một sự kiện vẫn tự đúng lại.
 */
export function useRefreshOnFocus(refresh: () => unknown): void {
  useEffect(() => {
    void refresh()
    const onFocus = (): void => void refresh()
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])
}
