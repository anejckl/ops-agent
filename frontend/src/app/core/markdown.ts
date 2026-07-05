/** Markdown-ish renderer for chat replies, ported verbatim from the old app. */

function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function renderMarkdownish(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, (_, code) => `<pre>${code.replace(/\n$/, '')}</pre>`);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  s = s.replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>');
  // simple pipe tables (with optional |---| separator rows, which are dropped)
  s = s.replace(/((?:^\|.*\|[ \t]*$\n?)+)/gm, block => {
    const rows = block.trim().split('\n').filter(r => !/^\|[\s:|-]+\|$/.test(r));
    if (rows.length < 2) return block;
    const cells = rows.map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    return '<table>' + cells.map((r, i) =>
      '<tr>' + r.map(c => i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`).join('') + '</tr>'
    ).join('') + '</table>';
  });
  // runs of "- " / "* " lines -> <ul>, "1. " lines -> <ol> (newlines consumed: .msg is pre-wrap)
  s = s.replace(/((?:^[-*] .*$\n?)+)/gm, block =>
    '<ul>' + block.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`).join('') + '</ul>');
  s = s.replace(/((?:^\d+\. .*$\n?)+)/gm, block =>
    '<ol>' + block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('') + '</ol>');
  return s;
}
