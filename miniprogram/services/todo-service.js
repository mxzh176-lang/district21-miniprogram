const cloudbase = require('./providers/cloudbase-adapter')

const ACTIONS = ['listTasks', 'getTask', 'saveTask', 'deleteTask', 'completeTask', 'reopenTask']

function handles(action) {
  return ACTIONS.includes(action)
}

function execute(action, payload) {
  return cloudbase.invoke(action, payload)
}

module.exports = { handles, execute }
