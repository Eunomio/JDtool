import { splitDialogue } from '../lib/dialogue';
import { Icon } from './ui';

export default function ColleagueMessage({ colleague, text, reply = false }: { colleague: string; text: string; reply?: boolean }) {
  const message = splitDialogue(text, colleague);
  return <div className="colleague-message"><span className="colleague-avatar"><Icon name="scenario" size={19} /></span><div className="colleague-content"><div className="colleague-meta"><strong>{message.speaker || colleague}</strong><span>{message.action || (reply ? '回复' : '发来消息')}</span></div><div className="colleague-bubble"><p>{message.content}</p></div></div></div>;
}
