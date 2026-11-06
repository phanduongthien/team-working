/** Khối artifact mẫu cho test e2e (người dùng gõ FAKE_ARTIFACT:<tên>) — chỉ dùng với FakeChatProvider. */
export const FAKE_ARTIFACTS: Record<string, string> = {
  sheet: `
<artifact type="sheet" title="Cân bằng">
Name, Damage, AttackSpeed, DPS = Damage * AttackSpeed
Warrior, 80, 1
Archer, 50, 1.5
Mage, 120, 0.8
Rogue, 60, 1.2
Giant, 400, 2
</artifact>`,
  edit: `
<artifact-edit title="Cân bằng"><find>Mage, 120, 0.8</find><replace>Mage, 100, 0.8</replace></artifact-edit>`,
  'bad-edit': `
<artifact-edit title="Cân bằng"><find>Paladin, 1, 1</find><replace>x</replace></artifact-edit>`,
  doc: `
<artifact type="doc" title="GDD">
# Game Design Document

## Core loop

\`\`\`mermaid
flowchart LR
  A[Đánh quái] --> B[Nhặt đồ] --> A
\`\`\`

\`\`\`chart
{"type":"bar","labels":["Q1","Q2"],"datasets":[{"label":"Người chơi","data":[10,20]}]}
\`\`\`
</artifact>`,
  slides: `
<artifact type="slides" title="Pitch">
theme: pixel
layout: title
# Game Hay
## Tagline
---
layout: two-column
# Gameplay
- Đánh
|||
- Né
notes: nói chậm
</artifact>`,
  // Thử mọi cách thoát sandbox — tất cả phải "blocked".
  probe: `
<artifact type="html" title="Probe"><!doctype html><html><head></head><body><pre id="probe">...</pre><script>
(async () => {
  const r = {}
  const t = async (k, f) => { try { await f(); r[k] = 'OPEN' } catch (e) { r[k] = 'blocked' } }
  await t('fetch', () => fetch('https://example.com/'))
  await t('localStorage', () => localStorage.getItem('x'))
  await t('cookie', () => document.cookie)
  await t('parentApi', () => { if (!window.parent.api) throw new Error('no') })
  await t('parentDom', () => window.parent.document.title)
  await t('topNav', () => { window.top.location.href = 'https://example.com/' })
  r.open = window.open('https://example.com/') ? 'OPEN' : 'blocked'
  document.getElementById('probe').textContent = JSON.stringify(r)
})()
</script></body></html></artifact>`,
  loop: `
<artifact type="html" title="Treo"><p id="before">trước vòng lặp</p><script>while (true) {}</script></artifact>`
}
