const REGION_EXCHANGES = {
  // North America
  'US': {
    exchanges: ['NASDAQ', 'NYSE', 'AMEX'],
    name: 'United States',
    currency: 'USD',
    timezone: 'America/New_York'
  },
  'CA': {
    exchanges: ['TSX', 'TSXV'],
    name: 'Canada',
    currency: 'CAD',
    timezone: 'America/Toronto'
  },
  'MX': {
    exchanges: ['BMV'],
    name: 'Mexico',
    currency: 'MXN',
    timezone: 'America/Mexico_City'
  },

  // Europe
  'GB': {
    exchanges: ['LSE', 'AIM'],
    name: 'United Kingdom',
    currency: 'GBP',
    timezone: 'Europe/London'
  },
  'DE': {
    exchanges: ['XETRA', 'FRA'],
    name: 'Germany',
    currency: 'EUR',
    timezone: 'Europe/Berlin'
  },
  'FR': {
    exchanges: ['EPA', 'PA'],
    name: 'France',
    currency: 'EUR',
    timezone: 'Europe/Paris'
  },
  'IT': {
    exchanges: ['BIT', 'MI'],
    name: 'Italy',
    currency: 'EUR',
    timezone: 'Europe/Rome'
  },
  'ES': {
    exchanges: ['BME', 'MC'],
    name: 'Spain',
    currency: 'EUR',
    timezone: 'Europe/Madrid'
  },
  'NL': {
    exchanges: ['AEX', 'AS'],
    name: 'Netherlands',
    currency: 'EUR',
    timezone: 'Europe/Amsterdam'
  },
  'CH': {
    exchanges: ['SWX', 'SW'],
    name: 'Switzerland',
    currency: 'CHF',
    timezone: 'Europe/Zurich'
  },
  'SE': {
    exchanges: ['STO', 'ST'],
    name: 'Sweden',
    currency: 'SEK',
    timezone: 'Europe/Stockholm'
  },
  'NO': {
    exchanges: ['OSE', 'OL'],
    name: 'Norway',
    currency: 'NOK',
    timezone: 'Europe/Oslo'
  },
  'DK': {
    exchanges: ['CPH', 'CO'],
    name: 'Denmark',
    currency: 'DKK',
    timezone: 'Europe/Copenhagen'
  },
  'FI': {
    exchanges: ['HEL', 'HE'],
    name: 'Finland',
    currency: 'EUR',
    timezone: 'Europe/Helsinki'
  },
  'BE': {
    exchanges: ['EBR', 'BR'],
    name: 'Belgium',
    currency: 'EUR',
    timezone: 'Europe/Brussels'
  },
  'AT': {
    exchanges: ['WBO', 'VI'],
    name: 'Austria',
    currency: 'EUR',
    timezone: 'Europe/Vienna'
  },
  'IE': {
    exchanges: ['ISE', 'IR'],
    name: 'Ireland',
    currency: 'EUR',
    timezone: 'Europe/Dublin'
  },
  'PT': {
    exchanges: ['ELI', 'LS'],
    name: 'Portugal',
    currency: 'EUR',
    timezone: 'Europe/Lisbon'
  },
  'PL': {
    exchanges: ['WSE', 'WA'],
    name: 'Poland',
    currency: 'PLN',
    timezone: 'Europe/Warsaw'
  },
  'CZ': {
    exchanges: ['PSE', 'PR'],
    name: 'Czech Republic',
    currency: 'CZK',
    timezone: 'Europe/Prague'
  },
  'HU': {
    exchanges: ['BET', 'BU'],
    name: 'Hungary',
    currency: 'HUF',
    timezone: 'Europe/Budapest'
  },
  'RO': {
    exchanges: ['BVB', 'RO'],
    name: 'Romania',
    currency: 'RON',
    timezone: 'Europe/Bucharest'
  },
  'GR': {
    exchanges: ['ASE', 'AT'],
    name: 'Greece',
    currency: 'EUR',
    timezone: 'Europe/Athens'
  },
  'TR': {
    exchanges: ['IST', 'IS'],
    name: 'Turkey',
    currency: 'TRY',
    timezone: 'Europe/Istanbul'
  },
  'RU': {
    exchanges: ['MCX', 'ME'],
    name: 'Russia',
    currency: 'RUB',
    timezone: 'Europe/Moscow'
  },

  // Asia Pacific
  'JP': {
    exchanges: ['TSE', 'T'],
    name: 'Japan',
    currency: 'JPY',
    timezone: 'Asia/Tokyo'
  },
  'CN': {
    exchanges: ['SSE', 'SZSE', 'SS', 'SZ'],
    name: 'China',
    currency: 'CNY',
    timezone: 'Asia/Shanghai'
  },
  'HK': {
    exchanges: ['HKEX', 'HK'],
    name: 'Hong Kong',
    currency: 'HKD',
    timezone: 'Asia/Hong_Kong'
  },
  'KR': {
    exchanges: ['KRX', 'KS', 'KQ'],
    name: 'South Korea',
    currency: 'KRW',
    timezone: 'Asia/Seoul'
  },
  'IN': {
    exchanges: ['BSE', 'NSE', 'BO', 'NS'],
    name: 'India',
    currency: 'INR',
    timezone: 'Asia/Kolkata'
  },
  'AU': {
    exchanges: ['ASX', 'AX'],
    name: 'Australia',
    currency: 'AUD',
    timezone: 'Australia/Sydney'
  },
  'SG': {
    exchanges: ['SGX', 'SI'],
    name: 'Singapore',
    currency: 'SGD',
    timezone: 'Asia/Singapore'
  },
  'TH': {
    exchanges: ['SET', 'BK'],
    name: 'Thailand',
    currency: 'THB',
    timezone: 'Asia/Bangkok'
  },
  'MY': {
    exchanges: ['MYX', 'KL'],
    name: 'Malaysia',
    currency: 'MYR',
    timezone: 'Asia/Kuala_Lumpur'
  },
  'ID': {
    exchanges: ['IDX', 'JK'],
    name: 'Indonesia',
    currency: 'IDR',
    timezone: 'Asia/Jakarta'
  },
  'PH': {
    exchanges: ['PSE', 'PS'],
    name: 'Philippines',
    currency: 'PHP',
    timezone: 'Asia/Manila'
  },
  'VN': {
    exchanges: ['HOSE', 'HNX', 'HM'],
    name: 'Vietnam',
    currency: 'VND',
    timezone: 'Asia/Ho_Chi_Minh'
  },
  'TW': {
    exchanges: ['TWSE', 'TW'],
    name: 'Taiwan',
    currency: 'TWD',
    timezone: 'Asia/Taipei'
  },
  'NZ': {
    exchanges: ['NZX', 'NZ'],
    name: 'New Zealand',
    currency: 'NZD',
    timezone: 'Pacific/Auckland'
  },
  'BD': {
    exchanges: ['DSE', 'CSE', 'DH'],
    name: 'Bangladesh',
    currency: 'BDT',
    timezone: 'Asia/Dhaka'
  },
  'PK': {
    exchanges: ['PSX', 'KA'],
    name: 'Pakistan',
    currency: 'PKR',
    timezone: 'Asia/Karachi'
  },
  'LK': {
    exchanges: ['CSE', 'CM'],
    name: 'Sri Lanka',
    currency: 'LKR',
    timezone: 'Asia/Colombo'
  },

  // Middle East & Africa
  'SA': {
    exchanges: ['TADAWUL', 'SAU', 'SR'],
    name: 'Saudi Arabia',
    currency: 'SAR',
    timezone: 'Asia/Riyadh'
  },
  'AE': {
    exchanges: ['DFM', 'ADX', 'DU', 'AB'],
    name: 'United Arab Emirates',
    currency: 'AED',
    timezone: 'Asia/Dubai'
  },
  'QA': {
    exchanges: ['QSE', 'QA'],
    name: 'Qatar',
    currency: 'QAR',
    timezone: 'Asia/Qatar'
  },
  'KW': {
    exchanges: ['KSE', 'KW'],
    name: 'Kuwait',
    currency: 'KWD',
    timezone: 'Asia/Kuwait'
  },
  'BH': {
    exchanges: ['BHB', 'BH'],
    name: 'Bahrain',
    currency: 'BHD',
    timezone: 'Asia/Bahrain'
  },
  'OM': {
    exchanges: ['MSM', 'MS'],
    name: 'Oman',
    currency: 'OMR',
    timezone: 'Asia/Muscat'
  },
  'JO': {
    exchanges: ['ASE', 'AM'],
    name: 'Jordan',
    currency: 'JOD',
    timezone: 'Asia/Amman'
  },
  'LB': {
    exchanges: ['BSE', 'BE'],
    name: 'Lebanon',
    currency: 'LBP',
    timezone: 'Asia/Beirut'
  },
  'IL': {
    exchanges: ['TASE', 'TA'],
    name: 'Israel',
    currency: 'ILS',
    timezone: 'Asia/Jerusalem'
  },
  'EG': {
    exchanges: ['EGX', 'CA'],
    name: 'Egypt',
    currency: 'EGP',
    timezone: 'Africa/Cairo'
  },
  'ZA': {
    exchanges: ['JSE', 'JO'],
    name: 'South Africa',
    currency: 'ZAR',
    timezone: 'Africa/Johannesburg'
  },
  'NG': {
    exchanges: ['NGX', 'NSE'],
    name: 'Nigeria',
    currency: 'NGN',
    timezone: 'Africa/Lagos'
  },
  'KE': {
    exchanges: ['NSE', 'KE'],
    name: 'Kenya',
    currency: 'KES',
    timezone: 'Africa/Nairobi'
  },
  'GH': {
    exchanges: ['GSE', 'GH'],
    name: 'Ghana',
    currency: 'GHS',
    timezone: 'Africa/Accra'
  },
  'MA': {
    exchanges: ['CSE', 'MA'],
    name: 'Morocco',
    currency: 'MAD',
    timezone: 'Africa/Casablanca'
  },
  'TN': {
    exchanges: ['TSE', 'TN'],
    name: 'Tunisia',
    currency: 'TND',
    timezone: 'Africa/Tunis'
  },

  // Latin America
  'BR': {
    exchanges: ['BOVESPA', 'B3', 'SA'],
    name: 'Brazil',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo'
  },
  'AR': {
    exchanges: ['BCBA', 'BA'],
    name: 'Argentina',
    currency: 'ARS',
    timezone: 'America/Buenos_Aires'
  },
  'CL': {
    exchanges: ['BCS', 'SN'],
    name: 'Chile',
    currency: 'CLP',
    timezone: 'America/Santiago'
  },
  'CO': {
    exchanges: ['BVC', 'CN'],
    name: 'Colombia',
    currency: 'COP',
    timezone: 'America/Bogota'
  },
  'PE': {
    exchanges: ['BVL', 'LM'],
    name: 'Peru',
    currency: 'PEN',
    timezone: 'America/Lima'
  },
  'UY': {
    exchanges: ['BVM', 'MV'],
    name: 'Uruguay',
    currency: 'UYU',
    timezone: 'America/Montevideo'
  },
  'VE': {
    exchanges: ['BVC', 'CR'],
    name: 'Venezuela',
    currency: 'VES',
    timezone: 'America/Caracas'
  }
};

export { REGION_EXCHANGES }