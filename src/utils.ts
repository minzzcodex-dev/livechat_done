export const env = (key: string, fallback?: string) => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${key}`);
  return v;
};

export const fmt = {
  bold: (s: string) => `*${s.replace(/\*/g, '\\*')}*`,
  code: (s: string) => '`' + s.replace(/`/g, '\\`') + '`',
};
