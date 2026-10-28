import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type Tree = { [key: string]: string | Tree }

function keys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`)
  )
}

const load = (file: string): Tree => JSON.parse(readFileSync(file, 'utf8')) as Tree

const root = join(__dirname, '..', '..')
const bundles: Array<[string, string]> = [[join(root, 'i18n'), 'common']]
const featuresDir = join(root, 'features')
for (const name of readdirSync(featuresDir)) {
  const dir = join(featuresDir, name, 'i18n')
  if (statSync(join(featuresDir, name)).isDirectory() && readdirSync(join(featuresDir, name)).includes('i18n')) {
    bundles.push([dir, name])
  }
}

describe('i18n', () => {
  it.each(bundles)('vi và en có cùng bộ khóa (%s)', (dir) => {
    expect(keys(load(join(dir, 'en.json'))).sort()).toEqual(keys(load(join(dir, 'vi.json'))).sort())
  })
})
