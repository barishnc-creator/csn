import { Fragment, type ReactNode } from 'react'

// Güvenli, küçük markdown: ```blok```, `kod`, **kalın**, *italik*, ~~üstü çizili~~, ||spoiler||, bağlantı, @bahsetme
// HTML hiç yorumlanmaz; her şey React düğümü olarak üretilir.

const inlineRe =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(~~[^~\n]+~~)|(\|\|[^|\n]+\|\|)|(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g

function Spoiler({ children }: { children: ReactNode }) {
  return (
    <span className="spoiler" onClick={(e) => e.currentTarget.classList.add('revealed')}>
      {children}
    </span>
  )
}

function inline(text: string, names: string[], myName: string | undefined, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(inlineRe)) {
    const idx = m.index ?? 0
    const tok = m[0]
    if (idx > last) out.push(...mentionify(text.slice(last, idx), names, myName, `${keyBase}-t${i}`))
    const k = `${keyBase}-${i++}`
    if (m[1]) out.push(<code key={k} className="inline-code">{tok.slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={k}>{inline(tok.slice(2, -2), names, myName, k)}</strong>)
    else if (m[3]) out.push(<em key={k}>{inline(tok.slice(1, -1), names, myName, k)}</em>)
    else if (m[4]) out.push(<s key={k}>{inline(tok.slice(2, -2), names, myName, k)}</s>)
    else if (m[5]) out.push(<Spoiler key={k}>{tok.slice(2, -2)}</Spoiler>)
    else if (m[6])
      out.push(
        <a key={k} href={tok} target="_blank" rel="noreferrer noopener">
          {tok}
        </a>,
      )
    last = idx + tok.length
  }
  if (last < text.length) out.push(...mentionify(text.slice(last), names, myName, `${keyBase}-end`))
  return out
}

/** Düz metindeki @İsim geçişlerini vurgula (en uzun isim önce) */
function mentionify(text: string, names: string[], myName: string | undefined, keyBase: string): ReactNode[] {
  if (!text.includes('@')) return [text]
  const all = [...names, 'herkes'].sort((a, b) => b.length - a.length)
  const out: ReactNode[] = []
  let buf = ''
  let i = 0
  let n = 0
  while (i < text.length) {
    if (text[i] === '@') {
      const rest = text.slice(i + 1)
      const hit = all.find((name) => rest.startsWith(name) && !/[\p{L}\p{N}_]/u.test(rest[name.length] ?? ''))
      if (hit) {
        if (buf) out.push(buf)
        buf = ''
        const me = hit === myName || hit === 'herkes'
        out.push(<span key={`${keyBase}-m${n++}`} className={`mention${me ? ' me' : ''}`}>@{hit}</span>)
        i += hit.length + 1
        continue
      }
    }
    buf += text[i]
    i++
  }
  if (buf) out.push(buf)
  return out
}

export function renderMarkdown(src: string, names: string[], myName?: string): ReactNode {
  const parts = src.split(/```(?:[a-z0-9]+\n)?([\s\S]*?)```/gi)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <pre key={i} className="code-block">
        <code>{part.replace(/^\n|\n$/g, '')}</code>
      </pre>
    ) : (
      <Fragment key={i}>
        {part.split('\n').map((line, j, arr) => (
          <Fragment key={j}>
            {line.startsWith('> ') ? (
              <span className="quote">{inline(line.slice(2), names, myName, `${i}-${j}`)}</span>
            ) : (
              inline(line, names, myName, `${i}-${j}`)
            )}
            {j < arr.length - 1 && <br />}
          </Fragment>
        ))}
      </Fragment>
    ),
  )
}

export function mentionsMe(content: string, myName?: string) {
  return !!myName && (content.includes(`@${myName}`) || content.includes('@herkes'))
}
