import { test, expect } from '@playwright/test';
import { readModelStream } from '../lib/model-stream';

test('分析结果逐段接收，跨字节中文与CRLF均正确拼接，不保存思考内容', async () => {
  const content = JSON.stringify({ facts: [{ text: '字节跳动提供内容产品。' }] });
  const frames = [
    { choices: [{ delta: { reasoning_content: '不应出现在结果中' } }] },
    ...[...content].map(text => ({ choices: [{ delta: { content: text } }] })),
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
  ].map(data => `data:${JSON.stringify(data)}\r\n\r\n`).join('') + 'data:[DONE]\r\n\r\n';
  const bytes = new TextEncoder().encode(frames);
  const result = await readModelStream(new Response(new ReadableStream({ start(controller) { for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7)); controller.close(); } })), new AbortController().signal);
  expect(result.choices[0].message.content).toBe(content); expect(result.choices[0].finish_reason).toBe('stop');
});

test('流中断时拒绝把部分JSON当作完整结果，长度截断保留结束原因', async () => {
  const frame = 'data:{"choices":[{"delta":{"content":"{}"}}]}\n\n';
  await expect(readModelStream(new Response(frame), new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESULT' });
  const result = await readModelStream(new Response(frame + 'data:{"choices":[{"delta":{},"finish_reason":"length"}]}\n\n'), new AbortController().signal);
  expect(result.choices[0].finish_reason).toBe('length');
});

test('流内限流或额度错误保留具体分类，不向用户暴露服务商正文', async () => {
  for (const [code, expected] of [['rate_limit_exceeded', 'MODEL_RATE_LIMITED'], ['insufficient_quota', 'MODEL_QUOTA_EXHAUSTED']]) {
    const error = await readModelStream(new Response(`data:${JSON.stringify({ error: { code, message: 'private-provider-body test-secret-key' } })}\n\n`), new AbortController().signal).catch(error => error);
    expect(error.code).toBe(expected); expect(error.message).not.toMatch(/private-provider-body|test-secret-key/);
  }
});

test('取消或响应过大时停止读取分析流并释放连接', async () => {
  for (const cancelledByUser of [true, false]) {
    let cancelled = false; const controller = new AbortController();
    if (cancelledByUser) controller.abort();
    const response = new Response(new ReadableStream({ start(stream) { stream.enqueue(new Uint8Array(cancelledByUser ? 5 : 4000001)); }, cancel() { cancelled = true; } }));
    await expect(readModelStream(response, controller.signal)).rejects.toBeDefined(); expect(cancelled).toBe(true);
  }
});

test('收到生成结束消息后立即完成，不等待服务商关闭长连接', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('data:{"choices":[{"delta":{"content":"{}"}}]}\n\ndata:{"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
  }, cancel() { cancelled = true; } }));
  const result = await readModelStream(response, new AbortController().signal);
  expect(result.choices[0].message.content).toBe('{}'); expect(cancelled).toBe(true);
});
