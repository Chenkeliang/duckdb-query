/**
 * 导出所有自定义规则
 */

module.exports = {
  'no-mui-in-new-layout': require('./no-mui-in-new-layout'),
  'no-fetch-in-useeffect': require('./no-fetch-in-useeffect'),
  'no-hardcoded-colors': require('./no-hardcoded-colors'),
  'require-i18n': require('./require-i18n'),
  'require-tanstack-query': require('./require-tanstack-query'),
  'no-arbitrary-tailwind': require('./no-arbitrary-tailwind'),
  'enforce-import-order': require('./enforce-import-order'),
};
