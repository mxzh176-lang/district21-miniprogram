const cloudbase = require('./providers/cloudbase-adapter')

function initialize(options = {}) {
  return cloudbase.initialize(options)
}

module.exports = { initialize }
