/**
 * Bộ phân tích công thức an toàn cho bảng cân bằng chỉ số — KHÔNG dùng eval() / new Function.
 * Cú pháp: số, tên cột (chữ/số/_), + - * / ^ %, so sánh (< <= > >= = !=), ngoặc, và hàm:
 * min, max, round(x[, chữ số]), floor, ceil, abs, sqrt, pow, if(điều kiện, a, b).
 */

export type Node =
  | { t: 'num'; v: number }
  | { t: 'ref'; name: string }
  | { t: 'un'; op: '-'; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] }

export class FormulaError extends Error {}

const FUNCS: Record<string, { min: number; max: number; excel: string }> = {
  min: { min: 1, max: 20, excel: 'MIN' },
  max: { min: 1, max: 20, excel: 'MAX' },
  round: { min: 1, max: 2, excel: 'ROUND' },
  floor: { min: 1, max: 1, excel: 'INT' },
  ceil: { min: 1, max: 1, excel: 'ROUNDUP' },
  abs: { min: 1, max: 1, excel: 'ABS' },
  sqrt: { min: 1, max: 1, excel: 'SQRT' },
  pow: { min: 2, max: 2, excel: 'POWER' },
  if: { min: 3, max: 3, excel: 'IF' }
}

type Tok = { k: 'num' | 'id' | 'op' | '(' | ')' | ','; v: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i))
    if (num) {
      out.push({ k: 'num', v: num[0] })
      i += num[0].length
      continue
    }
    const id = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i))
    if (id) {
      out.push({ k: 'id', v: id[0] })
      i += id[0].length
      continue
    }
    const op = /^(?:<=|>=|!=|<>|[-+*/^%<>=])/.exec(src.slice(i))
    if (op) {
      out.push({ k: 'op', v: op[0] === '<>' ? '!=' : op[0] })
      i += op[0].length
      continue
    }
    if (c === '(' || c === ')' || c === ',') {
      out.push({ k: c, v: c })
      i++
      continue
    }
    throw new FormulaError(`Ký tự không hợp lệ: "${c}"`)
  }
  return out
}

const PREC: Record<string, number> = {
  '<': 1,
  '<=': 1,
  '>': 1,
  '>=': 1,
  '=': 1,
  '!=': 1,
  '+': 2,
  '-': 2,
  '*': 3,
  '/': 3,
  '%': 3,
  '^': 4
}

export function parseFormula(src: string): Node {
  if (src.length > 500) throw new FormulaError('Công thức quá dài')
  const toks = tokenize(src)
  let p = 0
  const peek = (): Tok | undefined => toks[p]
  const expect = (k: Tok['k']): Tok => {
    const t = toks[p++]
    if (!t || t.k !== k) throw new FormulaError(`Thiếu "${k}"`)
    return t
  }
  const primary = (depth: number): Node => {
    if (depth > 50) throw new FormulaError('Công thức lồng quá sâu')
    const t = toks[p++]
    if (!t) throw new FormulaError('Công thức bị cụt')
    if (t.k === 'num') return { t: 'num', v: Number(t.v) }
    if (t.k === 'op' && t.v === '-') return { t: 'un', op: '-', a: primary(depth + 1) }
    if (t.k === 'op' && t.v === '+') return primary(depth + 1)
    if (t.k === '(') {
      const e = expr(0, depth + 1)
      expect(')')
      return e
    }
    if (t.k === 'id') {
      if (peek()?.k === '(') {
        const fn = t.v.toLowerCase()
        const spec = FUNCS[fn]
        if (!spec) throw new FormulaError(`Hàm không hỗ trợ: ${t.v}`)
        p++
        const args: Node[] = []
        if (peek()?.k !== ')') {
          do args.push(expr(0, depth + 1))
          while (peek()?.k === ',' && p++)
        }
        expect(')')
        if (args.length < spec.min || args.length > spec.max)
          throw new FormulaError(`Sai số tham số của ${fn}`)
        return { t: 'call', fn, args }
      }
      return { t: 'ref', name: t.v }
    }
    throw new FormulaError(`Không mong đợi "${t.v}"`)
  }
  const expr = (minPrec: number, depth: number): Node => {
    let left = primary(depth)
    for (;;) {
      const t = peek()
      if (!t || t.k !== 'op' || PREC[t.v] === undefined || PREC[t.v] < minPrec) return left
      p++
      // ^ kết hợp phải, còn lại kết hợp trái
      const right = expr(t.v === '^' ? PREC[t.v] : PREC[t.v] + 1, depth + 1)
      left = { t: 'bin', op: t.v, a: left, b: right }
    }
  }
  const node = expr(0, 0)
  if (p < toks.length) throw new FormulaError(`Thừa "${toks[p].v}"`)
  return node
}

/** Các cột mà công thức dùng tới. */
export function refsOf(node: Node, out = new Set<string>()): Set<string> {
  if (node.t === 'ref') out.add(node.name)
  else if (node.t === 'un') refsOf(node.a, out)
  else if (node.t === 'bin') {
    refsOf(node.a, out)
    refsOf(node.b, out)
  } else if (node.t === 'call') node.args.forEach((a) => refsOf(a, out))
  return out
}

export function evaluate(node: Node, get: (name: string) => number): number {
  switch (node.t) {
    case 'num':
      return node.v
    case 'ref':
      return get(node.name)
    case 'un':
      return -evaluate(node.a, get)
    case 'bin': {
      const a = evaluate(node.a, get)
      const b = evaluate(node.b, get)
      switch (node.op) {
        case '+':
          return a + b
        case '-':
          return a - b
        case '*':
          return a * b
        case '/':
          return b === 0 ? NaN : a / b
        case '%':
          return b === 0 ? NaN : a % b
        case '^':
          return a ** b
        case '<':
          return a < b ? 1 : 0
        case '<=':
          return a <= b ? 1 : 0
        case '>':
          return a > b ? 1 : 0
        case '>=':
          return a >= b ? 1 : 0
        case '=':
          return a === b ? 1 : 0
        case '!=':
          return a !== b ? 1 : 0
      }
      return NaN
    }
    case 'call': {
      const v = (i: number): number => evaluate(node.args[i], get)
      switch (node.fn) {
        case 'min':
          return Math.min(...node.args.map((_, i) => v(i)))
        case 'max':
          return Math.max(...node.args.map((_, i) => v(i)))
        case 'round': {
          const d = node.args.length > 1 ? v(1) : 0
          const f = 10 ** d
          return Math.round(v(0) * f) / f
        }
        case 'floor':
          return Math.floor(v(0))
        case 'ceil':
          return Math.ceil(v(0))
        case 'abs':
          return Math.abs(v(0))
        case 'sqrt':
          return Math.sqrt(v(0))
        case 'pow':
          return v(0) ** v(1)
        case 'if':
          return v(0) ? v(1) : v(2)
      }
      return NaN
    }
  }
}

/** Đổi sang công thức Excel cho một hàng (tên cột → địa chỉ ô, vd Damage → C2). */
export function toExcel(node: Node, cellOf: (name: string) => string): string {
  const go = (n: Node): string => {
    switch (n.t) {
      case 'num':
        return String(n.v)
      case 'ref':
        return cellOf(n.name)
      case 'un':
        return `-(${go(n.a)})`
      case 'bin':
        if (n.op === '%') return `MOD(${go(n.a)},${go(n.b)})`
        return `(${go(n.a)}${n.op === '!=' ? '<>' : n.op}${go(n.b)})`
      case 'call':
        if (n.fn === 'ceil') return `ROUNDUP(${go(n.args[0])},0)`
        if (n.fn === 'round' && n.args.length === 1) return `ROUND(${go(n.args[0])},0)`
        return `${FUNCS[n.fn].excel}(${n.args.map(go).join(',')})`
    }
  }
  return go(node)
}
