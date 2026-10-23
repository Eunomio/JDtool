class VoiceRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input?.length) this.port.postMessage(new Float32Array(input));
    return true;
  }
}
registerProcessor('voice-recorder', VoiceRecorder);
