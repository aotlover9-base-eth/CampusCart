import type { Metadata } from 'next'
import { ChatList } from '@/components/chat/chat-list'

export const metadata: Metadata = {
  title: 'Chats',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function ChatsPage() {
  return <ChatList />
}
