// JSON.parse로 문법을 검증한 문자열에서 키만 확인하며 이스케이프된 같은 키도 거부합니다.
function rejectDuplicateKeys(text: string) {
  const stack: { keys: Set<string> | null; keyExpected: boolean }[] = [];
  for (const match of text.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}[\],]/g)) {
    const token = match[0];
    const current = stack.at(-1);
    if (token === '{' || token === '[') {
      if (stack.length >= 128) throw new Error('JSON_CONTRACT_INVALID');
      stack.push({ keys: token === '{' ? new Set() : null, keyExpected: true });
    } else if (token === '}' || token === ']') stack.pop();
    else if (token === ',') {
      if (current) current.keyExpected = true;
    } else if (current?.keys && current.keyExpected) {
      const key: unknown = JSON.parse(token);
      if (typeof key !== 'string' || current.keys.has(key))
        throw new Error('JSON_CONTRACT_INVALID');
      current.keys.add(key);
      current.keyExpected = false;
    }
  }
}

export function parseUniqueJson(text: string): unknown {
  const value: unknown = JSON.parse(text);
  rejectDuplicateKeys(text);
  return value;
}
