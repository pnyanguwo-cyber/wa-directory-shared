// Order text compiler shared by the web cart drawer and the WhatsApp bot's
// checkout screen. The compiled message is prefilled into a wa.me deep link
// so the CUSTOMER sends it to the supplier — no bot identity, no 24h window,
// no template review.
export interface OrderLine {
  name: string
  qty: number
  price: number | null
}

export interface CompiledOrder {
  text: string
  lines: string[]
  total: number | null
}

const MAX_LINES = 25
const MAX_TEXT = 1200
const NOTE_MAX = 140

function money(v: number): string {
  // Prices are USD float columns; whole dollars lose .00 for compactness.
  const rounded = Math.round(v * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

export function compileOrderText(input: {
  businessName: string
  city?: string | null
  lines: OrderLine[]
  note?: string | null
}): CompiledOrder {
  const name = input.businessName?.trim() || 'the shop'
  const city = input.city?.trim()
  const note = input.note?.trim()

  const lines = input.lines
    .filter(l => l.qty > 0)
    .slice(0, MAX_LINES)
    .map((l, i) => {
      const price = l.price != null ? ` — $${money(l.price)}` : ''
      const item = `${i + 1}. ${l.name.split('\n')[0].slice(0, 60)} ×${l.qty}${price}`
      return item
    })

  const known = input.lines.filter(l => l.qty > 0 && l.price != null)
  const total = known.length ? known.reduce((s, l) => s + (l.price || 0) * l.qty, 0) : null

  const out: string[] = []
  out.push(`🧺 *Order — ${name}*`)
  if (city) out.push(`📍 ${city}`)
  out.push(...lines.map(s => s.slice(0, 90)))
  if (total != null) out.push(`*Total: $${money(total)}*`)
  if (note) out.push(`📝 Note: ${note.slice(0, NOTE_MAX)}`)
  out.push('(sent via WA Directory)')

  let text = out.join('\n')
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT - 1) + '…'
  return { text, lines, total }
}

export function orderWaHref(digits: string, order: string): string {
  const clean = digits.replace(/\D/g, '')
  return `https://wa.me/${clean}?text=${encodeURIComponent(order)}`
}
