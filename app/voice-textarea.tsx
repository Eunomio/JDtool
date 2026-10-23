'use client';
import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { accountRequestHeaders } from '../lib/database';
import { encodeVoiceWav } from '../lib/voice-wav';
import { AsyncStatus } from './async-status';
import { Icon } from './ui';

export default function VoiceTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const field = useRef<HTMLTextAreaElement>(null); const dialog = useRef<HTMLDialogElement>(null);
  const [caption, setCaption] = useState(''); const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'permission' | 'recording' | 'transcribing'>('idle');
  const [text, setText] = useState(''); const [error, setError] = useState(''); const [seconds, setSeconds] = useState(0); const [level, setLevel] = useState(0);
  const capture = useRef<{ context: AudioContext; stream: MediaStream; node: AudioWorkletNode; source: MediaStreamAudioSourceNode; gain: GainNode } | null>(null);
  const chunks = useRef<Float32Array[]>([]); const recordingStart = useRef(0); const clock = useRef<ReturnType<typeof setInterval> | null>(null);
  const request = useRef<AbortController | null>(null); const generation = useRef(0); const range = useRef<[number, number]>([0, 0]); const pointerRange = useRef<[number, number] | null>(null); const alive = useRef(true);
  const lastAudio = useRef<ArrayBuffer | null>(null);
  useLayoutEffect(() => { const label = field.current?.closest('label'); setCaption(props['aria-label'] || [...(label?.childNodes || [])].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim() || '这段文字'); }, [props['aria-label']]);
  function stopCapture() {
    if (clock.current) clearInterval(clock.current); clock.current = null;
    const active = capture.current; capture.current = null;
    if (active) { active.node.port.onmessage = null; active.source.disconnect(); active.node.disconnect(); active.gain.disconnect(); active.stream.getTracks().forEach(track => track.stop()); void active.context.close().catch(() => {}); }
  }
  function close() { generation.current++; request.current?.abort(); stopCapture(); chunks.current = []; lastAudio.current = null; setPhase('idle'); setOpen(false); }
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; request.current?.abort(); stopCapture(); chunks.current = []; lastAudio.current = null; }; }, []);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  async function stopAndRecognize() {
    const active = capture.current; if (!active) return;
    const audio = encodeVoiceWav(chunks.current, active.context.sampleRate); chunks.current = []; stopCapture(); lastAudio.current = audio; await recognize(audio);
  }
  async function recognize(audio: ArrayBuffer) {
    setPhase('transcribing'); setLevel(0); setError('');
    const token = generation.current; const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch('/api/voice/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav', ...accountRequestHeaders() }, body: audio, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(100000)]) });
      const result = await response.json(); if (!response.ok) throw Error(result.error?.message || '这次语音未能识别，请重新录制。');
      if (alive.current && token === generation.current) { lastAudio.current = null; setText(current => current ? `${current}\n${result.text}` : result.text); }
    } catch (problem) { if (alive.current && token === generation.current) setError(controller.signal.aborted ? '已停止识别，可以重新录音。' : problem instanceof Error ? problem.message : '识别尚未完成，请重试。'); }
    finally { if (alive.current && token === generation.current) setPhase('idle'); }
  }
  async function start() {
    setError(''); setPhase('permission'); const token = ++generation.current;
    let stream: MediaStream | null = null; let context: AudioContext | null = null;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Error('请使用HTTPS页面和支持麦克风的浏览器。');
      const policy = document as Document & { permissionsPolicy?: { allowsFeature: (feature: string) => boolean }; featurePolicy?: { allowsFeature: (feature: string) => boolean } };
      if ((policy.permissionsPolicy || policy.featurePolicy)?.allowsFeature('microphone') === false) throw Error('当前嵌入页面限制了麦克风，请在独立窗口打开网页后使用语音输入。');
      const check = await fetch('/api/voice/transcribe', { headers: accountRequestHeaders(), signal: AbortSignal.timeout(10000) }); const state = await check.json();
      if (!check.ok || !state.available) throw Error('语音输入暂时不可用，请稍后重试。');
      if (!alive.current || token !== generation.current) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (!alive.current || token !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      context = new AudioContext(); await context.resume(); await context.audioWorklet.addModule('/voice-recorder.js');
      if (!alive.current || token !== generation.current) { stream.getTracks().forEach(track => track.stop()); await context.close(); return; }
      const source = context.createMediaStreamSource(stream); const node = new AudioWorkletNode(context, 'voice-recorder'); const gain = context.createGain(); gain.gain.value = 0;
      chunks.current = []; lastAudio.current = null; let lastLevel = 0;
      node.port.onmessage = event => { const chunk = new Float32Array(event.data); chunks.current.push(chunk); if (Date.now() - lastLevel > 100) { let power = 0; for (const sample of chunk) power += sample * sample; setLevel(Math.min(1, Math.sqrt(power / chunk.length) * 8)); lastLevel = Date.now(); } };
      source.connect(node); node.connect(gain); gain.connect(context.destination); capture.current = { context, stream, node, source, gain };
      recordingStart.current = Date.now(); setSeconds(0); setPhase('recording');
      clock.current = setInterval(() => { const elapsed = Math.floor((Date.now() - recordingStart.current) / 1000); setSeconds(elapsed); if (elapsed >= 60) void stopAndRecognize(); }, 500);
    } catch (problem) {
      stream?.getTracks().forEach(track => track.stop()); if (context) void context.close().catch(() => {});
      if (alive.current && token === generation.current) { setPhase('idle'); setError(problem instanceof DOMException && problem.name === 'NotAllowedError' ? '请允许浏览器使用麦克风后重试。' : problem instanceof Error ? problem.message : '无法使用麦克风，请检查设备后重试。'); }
    }
  }
  function insert() {
    const target = field.current; if (!target || !text.trim()) return;
    const [start, end] = range.current; const next = `${target.value.slice(0, start)}${text.trim()}${target.value.slice(end)}`;
    if (props.maxLength && next.length > props.maxLength) { setError(`合并后超过${props.maxLength}字，请精简识别文字后再填入。`); return; }
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(target, next);
    target.dispatchEvent(new Event('input', { bubbles: true })); close(); requestAnimationFrame(() => { target.focus(); target.setSelectionRange(start + text.trim().length, start + text.trim().length); });
  }
  return <div className="voice-field"><textarea {...props} ref={field} aria-label={props['aria-label'] || caption || undefined} />{!props.readOnly && <button type="button" className="voice-trigger" disabled={props.disabled} aria-label={`语音输入：${caption || '这段文字'}`} onPointerDown={() => { const target = field.current; if (target) pointerRange.current = document.activeElement === target ? [target.selectionStart, target.selectionEnd] : [target.value.length, target.value.length]; }} onClick={event => { event.preventDefault(); event.stopPropagation(); range.current = pointerRange.current || [field.current?.value.length || 0, field.current?.value.length || 0]; pointerRange.current = null; setText(''); setError(''); setPhase('idle'); setOpen(true); }}><Icon name="mic" size={16} />语音输入</button>}
    {open && createPortal(<dialog ref={dialog} className="voice-dialog" aria-labelledby="voice-heading" onCancel={event => { event.preventDefault(); close(); }} onClose={() => { if (open) close(); }}><header><div><h2 id="voice-heading">语音输入</h2><p>{caption}</p></div><button className="secondary small" aria-label="关闭语音输入" onClick={close}>×</button></header><p className="voice-notice">录音用于转写，核对后再填入。单次最多60秒，可分段继续录音。</p>
      {error && <div className="notice error" role="alert">{error}{lastAudio.current && phase === 'idle' && <button type="button" className="secondary" onClick={() => { if (lastAudio.current) void recognize(lastAudio.current); }}>重试识别这段录音</button>}{error.includes('嵌入页面') && <a className="secondary" href={window.location.href} target="_blank" rel="noreferrer">在独立窗口打开</a>}</div>}
      {phase === 'transcribing' ? <AsyncStatus label="正在识别语音" onCancel={() => request.current?.abort()} /> : <div className={`voice-capture ${phase === 'recording' ? 'recording' : ''}`}><span className="voice-mic"><Icon name="mic" size={30} /></span><div className="voice-wave" aria-hidden="true">{[.5, .8, 1, .7, .9].map((weight, index) => <i key={index} style={{ height: `${8 + level * weight * 46}px` }} />)}</div><strong role="status">{phase === 'recording' ? `正在录音 ${seconds} / 60秒` : phase === 'permission' ? '正在申请麦克风…' : '准备好后开始录音'}</strong><button type="button" className={phase === 'recording' ? 'voice-stop' : 'primary'} disabled={phase === 'permission'} onClick={() => phase === 'recording' ? void stopAndRecognize() : void start()}>{phase === 'recording' ? '停止并识别' : text ? '继续录音' : '开始录音'}</button></div>}
      <label className="voice-preview-label">识别文字<textarea aria-label="识别文字" rows={5} value={text} onChange={event => setText(event.target.value)} placeholder="识别完成后，可在这里核对和修改" /></label><footer><button className="secondary" onClick={close}>取消</button><button className="primary" disabled={!text.trim() || phase !== 'idle'} onClick={insert}>填入文字<Icon name="arrow" size={15} /></button></footer>
    </dialog>, document.body)}
  </div>;
}
