const path = require('node:path');
const sherpa = require('sherpa-onnx-node');
let recognizer;
process.on('disconnect', () => process.exit(0));
process.on('message', async message => {
  try {
    if (!recognizer) recognizer = await sherpa.OfflineRecognizer.createAsync({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: { senseVoice: { model: path.join(process.env.ASR_MODEL_DIR, 'model.int8.onnx'), language: 'auto', useInverseTextNormalization: 1 }, tokens: path.join(process.env.ASR_MODEL_DIR, 'tokens.txt'), numThreads: 2, provider: 'cpu', debug: 0 },
      decodingMethod: 'greedy_search',
    });
    const samples = new Float32Array(message.samples);
    const chunks = []; // Bound individual inference windows to keep memory stable on the free CPU.
    for (let offset = 0; offset < samples.length; offset += 16000 * 20) {
      const stream = recognizer.createStream(); stream.acceptWaveform({ sampleRate: 16000, samples: samples.subarray(offset, offset + 16000 * 20) });
      const result = await recognizer.decodeAsync(stream); const text = (result?.text || recognizer.getResult(stream).text || '').replace(/<\|[^>]*\|>/g, '').trim();
      if (text) chunks.push(text);
    }
    process.send?.({ id: message.id, text: chunks.join('') });
  } catch { process.send?.({ id: message.id, error: true }); }
});
