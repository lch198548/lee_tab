// lunar-javascript 类型补丁:库未自带 d.ts,此处声明用到的最小 API 面
declare module 'lunar-javascript' {
  export interface Lunar {
    toString(): string
    getYearInChinese(): string
    getMonthInChinese(): string
    getDayInChinese(): string
    getYearInGanZhi(): string
    getMonthInGanZhi(): string
    getDayInGanZhi(): string
    getYearShengXiao(): string
    getJieQi(): string
    getDayYi(): string[]
    getDayJi(): string[]
    getDayPositionXiDesc(): string
    getDayPositionFuDesc(): string
    getDayPositionCaiDesc(): string
    getDayPositionYangGuiDesc(): string
    getDayPositionYinGuiDesc(): string
    getWuHou(): string
  }

  export interface Solar {
    getLunar(): Lunar
    getXingZuo(): string
    getWeek(): number
  }

  export const Solar: {
    fromYmd(y: number, m: number, d: number): Solar
    fromYmdHms(y: number, m: number, d: number, h: number, mi: number, s: number): Solar
    fromDate(date: Date): Solar
  }

  export const Lunar: {
    fromYmd(lY: number, lM: number, lD: number): Lunar
  }
}
