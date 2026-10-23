import type { ReactNode } from 'react';
import { Icon } from './ui';
export default function ChatMessage({ name, own = false, children, status, className = '' }: { name: string; own?: boolean; children: ReactNode; status?: string; className?: string }) {
  return <article className={`chat-message ${own ? 'chat-own' : 'chat-other'} ${className}`}><span className="chat-avatar" aria-hidden="true">{own ? '我' : <Icon name="interview" size={18} />}</span><div className="chat-message-content"><span className="chat-speaker">{name}</span><div className="chat-bubble">{children}</div>{status && <span className="chat-message-status">{status}</span>}</div></article>;
}
