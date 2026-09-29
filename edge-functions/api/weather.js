// GET /api/weather?city=北京 -> Open-Meteo 天气代理(免 key) + KV 缓存 30min
// 链路:geocoding-api.open-meteo.com 城市定位 -> api.open-meteo.com 预报
// WMO 天气代码 -> 中文文案 + 图标 key 在后端统一映射,前端只渲染。
import { getKV, kvGetJSON, kvPutJSON, jsonResponse, errorResponse } from '../_lib/kv.js'

const TTL = 30 * 60 * 1000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function timeoutOpt(ms) {
  const opt = { headers: { 'User-Agent': UA } }
  try {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opt.signal = AbortSignal.timeout(ms)
  } catch { /* 边缘环境可能不支持,忽略 */ }
  return opt
}

// WMO weather code -> [中文文案, 图标 key]
// icon key: sun/partly/cloud/fog/drizzle/rain/snow/showers/thunder
function wmo(code) {
  const m = {
    0: ['晴', 'sun'], 1: ['晴', 'sun'], 2: ['多云', 'partly'], 3: ['阴', 'cloud'],
    45: ['雾', 'fog'], 48: ['雾凇', 'fog'],
    51: ['毛毛雨', 'drizzle'], 53: ['毛毛雨', 'drizzle'], 55: ['毛毛雨', 'drizzle'],
    56: ['冻雨', 'rain'], 57: ['冻雨', 'rain'],
    61: ['小雨', 'rain'], 63: ['中雨', 'rain'], 65: ['大雨', 'rain'],
    66: ['冻雨', 'rain'], 67: ['冻雨', 'rain'],
    71: ['小雪', 'snow'], 73: ['中雪', 'snow'], 75: ['大雪', 'snow'], 77: ['雪粒', 'snow'],
    80: ['阵雨', 'showers'], 81: ['阵雨', 'showers'], 82: ['强阵雨', 'showers'],
    85: ['阵雪', 'snow'], 86: ['阵雪', 'snow'],
    95: ['雷阵雨', 'thunder'], 96: ['雷雨冰雹', 'thunder'], 99: ['雷雨冰雹', 'thunder']
  }
  const [text, icon] = m[code] || ['未知', 'cloud']
  return { text, icon }
}

async function geocode(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`
  const r = await fetch(url, timeoutOpt(8000))
  if (!r.ok) throw new Error('城市定位失败(' + r.status + ')')
  const d = await r.json()
  const g = d && Array.isArray(d.results) ? d.results[0] : null
  if (!g || typeof g.latitude !== 'number') throw new Error(`未找到城市「${city}」`)
  return g
}

async function fetchWeather(city) {
  const g = await geocode(city)
  const qs = new URLSearchParams({
    latitude: String(g.latitude),
    longitude: String(g.longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m,surface_pressure,precipitation',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,wind_speed_10m_max,uv_index_max',
    timezone: 'auto',
    forecast_days: '7',
    forecast_hours: '24'
  })
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`, timeoutOpt(8000))
  if (!r.ok) throw new Error('天气获取失败(' + r.status + ')')
  const d = await r.json()
  const c = d.current || {}
  const cw = wmo(c.weather_code)
  // 未来 24 小时逐时预报(forecast_hours 由 Open-Meteo 从当前小时起算)
  const hTimes = (d.hourly && d.hourly.time) || []
  const hourly = hTimes.map((t, i) => {
    const hw = wmo(d.hourly.weather_code[i])
    const pop = d.hourly.precipitation_probability ? d.hourly.precipitation_probability[i] : null
    return {
      time: t,
      temp: Math.round(d.hourly.temperature_2m[i]),
      text: hw.text,
      icon: hw.icon,
      pop: typeof pop === 'number' ? pop : null,
      isDay: d.hourly.is_day ? d.hourly.is_day[i] === 1 : true
    }
  })
  const daily = ((d.daily && d.daily.time) || []).map((t, i) => {
    const dw = wmo(d.daily.weather_code[i])
    return {
      date: t,
      text: dw.text,
      icon: dw.icon,
      max: Math.round(d.daily.temperature_2m_max[i]),
      min: Math.round(d.daily.temperature_2m_min[i]),
      sunrise: (d.daily.sunrise && d.daily.sunrise[i]) || '',
      sunset: (d.daily.sunset && d.daily.sunset[i]) || '',
      pop: typeof d.daily.precipitation_probability_max[i] === 'number' ? d.daily.precipitation_probability_max[i] : null,
      windMax: typeof d.daily.wind_speed_10m_max[i] === 'number' ? Math.round(d.daily.wind_speed_10m_max[i]) : null,
      uv: typeof d.daily.uv_index_max[i] === 'number' ? Math.round(d.daily.uv_index_max[i]) : null
    }
  })
  return {
    city: g.name,
    admin: g.admin1 || '',
    current: {
      temp: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature),
      text: cw.text,
      icon: cw.icon,
      humidity: Math.round(c.relative_humidity_2m),
      wind: Math.round(c.wind_speed_10m),
      pressure: typeof c.surface_pressure === 'number' ? Math.round(c.surface_pressure) : null,
      rain: typeof c.precipitation === 'number' ? c.precipitation : null
    },
    hourly,
    daily,
    updated: new Date().toISOString()
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const city = (url.searchParams.get('city') || '').trim()
  if (!city || city.length > 40) return errorResponse('参数 city 无效', 400)

  const kv = getKV(env)
  const key = `weather_${city.toLowerCase()}`
  const cached = kv ? await kvGetJSON(kv, key, null) : null
  if (cached && cached.current && Date.now() - (cached.t || 0) < TTL) {
    return jsonResponse(cached.data)
  }

  try {
    const data = await fetchWeather(city)
    if (kv) await kvPutJSON(kv, key, { data, t: Date.now() })
    return jsonResponse(data)
  } catch (e) {
    // 旧缓存兜底(即使过期)
    if (cached && cached.data) return jsonResponse(cached.data)
    return errorResponse(e.message || '天气获取失败', 502)
  }
}
