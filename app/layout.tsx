import type { Metadata } from 'next';
import './globals.css';
import './experience.css';
import './account.css';
import './responsive.css';
import './onboarding.css';
import './readability.css';

export const metadata: Metadata = {
  title: '岗位探索与求职准备助手',
  description: '保存目标岗位，整理求职准备与投递进展。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
