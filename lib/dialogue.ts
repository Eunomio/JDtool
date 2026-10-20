function unwrapQuote(value: string) {
  const pairs: Record<string, string> = { '“': '”', '「': '」', '『': '』', '"': '"' };
  const closing = pairs[value[0]];
  if (!closing || !value.endsWith(closing)) return value;
  if (value[0] === closing) return value.indexOf(closing, 1) === value.length - 1 ? value.slice(1, -1).trim() : value;
  let depth = 0;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === value[0]) depth++;
    else if (value[index] === closing && --depth === 0) return index === value.length - 1 ? value.slice(1, -1).trim() : value;
  }
  return value;
}

/** Separate a legacy speech introduction from the words actually spoken. */
export function splitDialogue(text: string, colleague = '') {
  let content = text.trim(); let speaker = colleague; let action = '';
  const introduction = /^([^：:\n“”"「」]{1,40}?)\s*(发来(?:了)?(?:一条)?(?:消息|信息)|发消息|回复(?:道|说)?|回应(?:道|说)?|说道|说|问道|问|表示|提醒(?:道)?|补充(?:道)?)\s*[：:]\s*([\s\S]+)$/u.exec(content);
  if (introduction && (introduction[1].trim() === colleague || /同事|经理|负责人|设计师|工程师|运营|研究员|主管/.test(introduction[1]))) {
    speaker = introduction[1].trim(); action = introduction[2]; content = introduction[3].trim();
  } else if (colleague && (content.startsWith(`${colleague}：`) || content.startsWith(`${colleague}:`))) {
    content = content.slice(colleague.length + 1).trim();
  }
  return { speaker, action, content: unwrapQuote(content) };
}
