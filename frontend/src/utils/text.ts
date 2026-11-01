const encoder = new TextEncoder();
const windowsDecoder = new TextDecoder('windows-1252');
const repairs = new Map<string, string>();

for (const letter of 'ăâîșțĂÂÎȘȚşţŞŢ') {
  let encoded = letter;
  for (let pass = 0; pass < 2; pass += 1) {
    encoded = windowsDecoder.decode(encoder.encode(encoded));
    repairs.set(encoded, letter);
  }
}

const pattern = new RegExp([...repairs.keys()]
  .sort((first, second) => second.length - first.length)
  .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|'), 'g');

export function readableText(value: string) {
  return value.replace(pattern, (match) => repairs.get(match) ?? match);
}
