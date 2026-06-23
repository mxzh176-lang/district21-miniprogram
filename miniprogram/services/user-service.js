const cloudbase = require('./providers/cloudbase-adapter')

const ACTIONS = [
  'getSession',
  'saveMyProfile',
  'saveUserMemberCode',
  'listProfileOrganizations',
  'bootstrapGovernance',
  'listRoleAssignments',
  'listPlatformUsers',
  'listUserRoles',
  'listPermissionGrants',
  'saveUserRole',
  'savePermissionGrant',
  'revokeUserRole',
  'revokePermissionGrant',
  'saveRoleAssignment',
  'getMember',
  'saveMember',
  'listAppointments',
  'listAdminMembers',
  'listAdminCandidates',
  'saveAdminPermissions',
  'setMemberRole',
  'getAdminStats',
  'listAuditLogs'
]

function handles(action) {
  return ACTIONS.includes(action)
}

async function execute(action, payload, localFallback) {
  if (action === 'getSession') return cloudbase.invoke('getPlatformSession', payload, { timeout: 20000 })
  if (action === 'saveMyProfile') return cloudbase.invoke('saveMyProfile', payload)
  if (action === 'saveUserMemberCode') return cloudbase.invoke('saveUserMemberCode', payload)
  if (action === 'listProfileOrganizations') return cloudbase.invoke('listProfileOrganizations', payload)
  if ([
    'bootstrapGovernance',
    'listRoleAssignments',
    'listPlatformUsers',
    'saveRoleAssignment',
    'listUserRoles',
    'listPermissionGrants',
    'saveUserRole',
    'savePermissionGrant',
    'revokePermissionGrant',
    'revokeUserRole'
  ].includes(action)) {
    return cloudbase.invoke(action, payload)
  }
  return localFallback(action, payload)
}

module.exports = { handles, execute }
