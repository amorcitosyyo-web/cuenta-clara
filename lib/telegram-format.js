// Telegram's legacy Markdown reads _ and * in ANY text as formatting, so a merchant
// such as "SINPE MOVIL Uber___________" turned into italics (and lost its
// underscores) and one "*" could make Telegram reject the whole message.
//
// The report modules write **bold** on purpose. Keep exactly that, and escape
// everything else that Markdown would interpret, inside bold text as well
// (an entity cannot contain an escape, so it is closed and reopened around it).
function toTelegramMarkdown(text) {
  const bold = [];
  const marked = String(text || "").replace(/\*\*(.+?)\*\*/g, (_match, inner) => {
    bold.push(inner);
    return `\u0000${bold.length - 1}\u0000`;
  });
  const escape = (value) => value.replace(/([_*`[])/g, "\\$1");
  const asBold = (inner) => inner
    .replace(/\*/g, "")
    .split(/([_`[])/)
    .filter(Boolean)
    .map((part) => (/^[_`[]$/.test(part) ? `\\${part}` : `*${part}*`))
    .join("");
  return escape(marked).replace(/\u0000(\d+)\u0000/g, (_match, index) => asBold(bold[Number(index)]));
}

module.exports = { toTelegramMarkdown };
