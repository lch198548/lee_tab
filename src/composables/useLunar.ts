// 农历/节气/节日计算(solarlunar 本地计算,零网络依赖)
// special 判定优先级:农历传统节日 > 公历节日 > 节气
import solarlunar from 'solarlunar'
import type { SolarLunarResult } from 'solarlunar'

export interface SpecialDay {
  name: string
  type: 'fest' | 'term' // fest = 节日(强调色) / term = 节气(次强调色)
}

// 农历传统节日(lMonth-lDay,不分闰月)
const LUNAR_FESTS: Record<string, string> = {
  '1-1': '春节',
  '1-15': '元宵节',
  '5-5': '端午节',
  '7-7': '七夕',
  '8-15': '中秋节',
  '9-9': '重阳节',
  '12-8': '腊八节'
}

// 公历节日(cMonth-cDay)
const SOLAR_FESTS: Record<string, string> = {
  '1-1': '元旦',
  '5-1': '劳动节',
  '6-1': '儿童节',
  '10-1': '国庆节'
}

// 某公历日的农历信息 + 特殊日(节日/节气)
export function getLunarInfo(y: number, m: number, d: number): { lunar: SolarLunarResult | null; special: SpecialDay | null } {
  const lunar = solarlunar.solar2lunar(y, m, d)
  if (lunar === -1) return { lunar: null, special: null }

  // 农历节日
  const lk = `${lunar.lMonth}-${lunar.lDay}`
  if (LUNAR_FESTS[lk]) return { lunar, special: { name: LUNAR_FESTS[lk], type: 'fest' } }
  // 除夕 = 腊月最后一天(闰腊月场景极罕见,不做特判)
  if (lunar.lMonth === 12 && !lunar.isLeap && lunar.lDay >= 29 && lunar.lDay === solarlunar.monthDays(lunar.lYear, 12)) {
    return { lunar, special: { name: '除夕', type: 'fest' } }
  }
  // 公历节日
  const sk = `${m}-${d}`
  if (SOLAR_FESTS[sk]) return { lunar, special: { name: SOLAR_FESTS[sk], type: 'fest' } }
  // 节气
  if (lunar.isTerm && lunar.term) return { lunar, special: { name: lunar.term, type: 'term' } }
  return { lunar, special: null }
}

// 紧凑的农历短文案:特殊日显示名称,否则"八月十九"
export function lunarShort(lunar: SolarLunarResult | null, special: SpecialDay | null): string {
  if (special) return special.name
  if (!lunar) return ''
  return `${lunar.monthCn}${lunar.dayCn}`
}
