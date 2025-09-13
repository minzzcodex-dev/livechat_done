export const env = (key, fallback) => {
    const v = process.env[key] ?? fallback;
    if (v === undefined)
        throw new Error(`Missing env ${key}`);
    return v;
};
export const fmt = {
    bold: (s) => `*${s.replace(/\*/g, '\\*')}*`,
    code: (s) => '`' + s.replace(/`/g, '\\`') + '`',
};
