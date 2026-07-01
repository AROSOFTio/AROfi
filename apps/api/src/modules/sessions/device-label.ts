// Parses a browser User-Agent string into a short human-readable device label.
// No external dependency — regex only.

const SAMSUNG_MODELS: Record<string, string> = {
  // Galaxy S flagships
  'SM-S928': 'Galaxy S24 Ultra', 'SM-S926': 'Galaxy S24+', 'SM-S921': 'Galaxy S24',
  'SM-S918': 'Galaxy S23 Ultra', 'SM-S916': 'Galaxy S23+', 'SM-S911': 'Galaxy S23',
  'SM-S908': 'Galaxy S22 Ultra', 'SM-S906': 'Galaxy S22+', 'SM-S901': 'Galaxy S22',
  'SM-G998': 'Galaxy S21 Ultra', 'SM-G996': 'Galaxy S21+', 'SM-G991': 'Galaxy S21',
  'SM-G988': 'Galaxy S20 Ultra', 'SM-G986': 'Galaxy S20+', 'SM-G981': 'Galaxy S20',
  // Galaxy A mid-range
  'SM-A546': 'Galaxy A54', 'SM-A536': 'Galaxy A53', 'SM-A526': 'Galaxy A52',
  'SM-A346': 'Galaxy A34', 'SM-A336': 'Galaxy A33', 'SM-A145': 'Galaxy A14',
  'SM-A135': 'Galaxy A13', 'SM-A125': 'Galaxy A12', 'SM-A035': 'Galaxy A03',
  // Galaxy Note / Fold / Flip
  'SM-N986': 'Galaxy Note 20 Ultra', 'SM-N981': 'Galaxy Note 20',
  'SM-F946': 'Galaxy Z Fold 5', 'SM-F736': 'Galaxy Z Flip 5',
  'SM-F926': 'Galaxy Z Fold 3', 'SM-F711': 'Galaxy Z Flip 3',
}

function lookupSamsungModel(rawModel: string): string | null {
  // Match first 7 chars of model code (e.g. SM-S908B → SM-S908)
  const prefix = rawModel.slice(0, 7).toUpperCase()
  return SAMSUNG_MODELS[prefix] ?? null
}

export function parseDeviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null

  const ua = userAgent

  // iOS — iPhone / iPad
  if (/iPad/.test(ua)) {
    const iosMatch = ua.match(/CPU OS (\d+)/)
    return iosMatch ? `iPad · iOS ${iosMatch[1]}` : 'iPad'
  }
  if (/iPhone/.test(ua)) {
    const iosMatch = ua.match(/CPU iPhone OS (\d+)/)
    return iosMatch ? `iPhone · iOS ${iosMatch[1]}` : 'iPhone'
  }

  // Android — try to identify brand/model
  if (/Android/.test(ua)) {
    const androidVerMatch = ua.match(/Android (\d+)/)
    const androidVer = androidVerMatch ? androidVerMatch[1] : null

    // Samsung
    const samsungMatch = ua.match(/;\s*(SM-[A-Z0-9]+)/i)
    if (samsungMatch) {
      const modelName = lookupSamsungModel(samsungMatch[1])
      if (modelName) return androidVer ? `Samsung ${modelName} · Android ${androidVer}` : `Samsung ${modelName}`
      return androidVer ? `Samsung Android ${androidVer}` : 'Samsung'
    }

    // Xiaomi / Redmi / POCO
    if (/Xiaomi|Redmi|POCO/i.test(ua)) {
      const modelMatch = ua.match(/;\s*(Redmi[^;)]+|POCO[^;)]+|Xiaomi[^;)]+)/i)
      const model = modelMatch ? modelMatch[1].trim() : null
      return model ? (androidVer ? `${model} · Android ${androidVer}` : model) : (androidVer ? `Xiaomi Android ${androidVer}` : 'Xiaomi')
    }

    // TECNO / Infinix / itel (common in Uganda)
    if (/TECNO/i.test(ua)) {
      const modelMatch = ua.match(/;\s*(TECNO[^;)]+)/i)
      const model = modelMatch ? modelMatch[1].trim() : 'TECNO'
      return androidVer ? `${model} · Android ${androidVer}` : model
    }
    if (/Infinix/i.test(ua)) {
      const modelMatch = ua.match(/;\s*(Infinix[^;)]+)/i)
      const model = modelMatch ? modelMatch[1].trim() : 'Infinix'
      return androidVer ? `${model} · Android ${androidVer}` : model
    }
    if (/itel/i.test(ua)) return androidVer ? `itel Android ${androidVer}` : 'itel'

    // Huawei
    if (/Huawei|HUAWEI/i.test(ua)) return androidVer ? `Huawei Android ${androidVer}` : 'Huawei'

    // Google Pixel
    if (/Pixel/i.test(ua)) {
      const modelMatch = ua.match(/;\s*(Pixel[^;)]+)/i)
      const model = modelMatch ? modelMatch[1].trim() : 'Pixel'
      return androidVer ? `${model} · Android ${androidVer}` : model
    }

    // Generic Android
    return androidVer ? `Android ${androidVer}` : 'Android'
  }

  // Windows
  if (/Windows NT/.test(ua)) {
    const winMatch = ua.match(/Windows NT (\d+\.\d+)/)
    const winVer = winMatch ? ({ '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' }[winMatch[1]] ?? winMatch[1]) : ''
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser'
    return winVer ? `Windows ${winVer} · ${browser}` : `Windows · ${browser}`
  }

  // macOS
  if (/Macintosh|Mac OS X/.test(ua)) {
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
    return `Mac · ${browser}`
  }

  // Chrome OS
  if (/CrOS/.test(ua)) return 'Chromebook'

  // Linux desktop
  if (/Linux/.test(ua) && !/Android/.test(ua)) return 'Linux'

  return null
}
