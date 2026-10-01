// Size of the project page's "Ask your SA" panel, remembered per browser.
import { useState } from 'react'

export const CHAT_SIZES = ['collapsed', 'normal', 'wide'] as const
export type ChatSize = (typeof CHAT_SIZES)[number]

const STORAGE_KEY = 'sa-copilot.chat-size'

/** Grid columns of the project page (content | chat) per chat size; literal strings so Tailwind generates them. */
export const CHAT_GRID: Record<ChatSize, string> = {
  collapsed: 'lg:grid-cols-[minmax(0,1fr)_3.5rem]',
  normal: 'lg:grid-cols-[minmax(0,1fr)_400px]',
  wide: 'lg:grid-cols-[minmax(0,1fr)_min(720px,48vw)]',
}

export function parseChatSize(raw: string | null): ChatSize {
  return (CHAT_SIZES as readonly string[]).includes(raw ?? '') ? (raw as ChatSize) : 'normal'
}

function readChatSize(): ChatSize {
  try {
    return parseChatSize(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'normal' // storage blocked (private mode, policy)
  }
}

export function useChatSize(): [ChatSize, (size: ChatSize) => void] {
  const [size, setSize] = useState<ChatSize>(readChatSize)
  const update = (next: ChatSize) => {
    setSize(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // not remembered; the size still applies for this visit
    }
  }
  return [size, update]
}
