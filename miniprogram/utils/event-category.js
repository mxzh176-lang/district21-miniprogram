const EVENT_CATEGORIES = ['例会事件', '联谊事件', '关爱事件', '纠察事件', '培训事件', '会员发展']

function inferEventCategory(categoryId = '', categoryName = '') {
  const value = `${categoryId} ${categoryName}`.toLowerCase()
  if (/fellowship|social|联谊/.test(value)) return '联谊事件'
  if (/care|关爱/.test(value)) return '关爱事件'
  if (/tamer|纠察/.test(value)) return '纠察事件'
  if (/training|培训|领导力/.test(value)) return '培训事件'
  if (/member-retention|\bmember\b|会员/.test(value)) return '会员发展'
  return '例会事件'
}

function normalizeEventCategory(value, categoryId = '', categoryName = '') {
  return EVENT_CATEGORIES.includes(value) ? value : inferEventCategory(categoryId, categoryName)
}

module.exports = { EVENT_CATEGORIES, inferEventCategory, normalizeEventCategory }
