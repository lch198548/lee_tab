// solarlunar 类型补丁:该库 package.json exports 未挂 d.ts,TS 解析不到,此处本地声明
declare module 'solarlunar' {
  export interface SolarLunarResult {
    lYear: number
    lMonth: number
    lDay: number
    animal: string
    yearCn: string
    monthCn: string
    dayCn: string
    cYear: number
    cMonth: number
    cDay: number
    gzYear: string
    gzMonth: string
    gzDay: string
    isToday: boolean
    isLeap: boolean
    nWeek: number
    ncWeek: string
    isTerm: boolean
    term: string
  }

  const solarLunar: {
    lunarInfo: number[]
    monthDays(y: number, m: number): number
    solarDays(y: number, m: number): number
    getTerm(y: number, n: number): number
    solar2lunar(year?: number, month?: number, day?: number): SolarLunarResult | -1
    lunar2solar(year: number, month: number, day: number, isLeapMonth?: boolean): SolarLunarResult | -1
  }

  export default solarLunar
}
