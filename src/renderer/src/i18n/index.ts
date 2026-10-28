import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { FeatureDefinition } from '@renderer/features/types'
import en from './en.json'
import vi from './vi.json'

/** Khởi tạo i18next: namespace `common` + một namespace cho mỗi feature trong registry. */
export function initI18n(features: FeatureDefinition[]): typeof i18n {
  const resources: Record<'vi' | 'en', Record<string, Record<string, unknown>>> = {
    vi: { common: vi },
    en: { common: en }
  }
  for (const f of features) {
    resources.vi[f.id] = f.i18n.vi
    resources.en[f.id] = f.i18n.en
  }
  void i18n.use(initReactI18next).init({
    resources,
    lng: 'vi',
    fallbackLng: 'vi',
    defaultNS: 'common',
    interpolation: { escapeValue: false }
  })
  return i18n
}

export default i18n
