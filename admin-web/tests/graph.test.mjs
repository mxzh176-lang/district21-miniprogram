import assert from 'node:assert/strict'
import { buildGraph } from '../src/graph.js'

const graph = buildGraph({
  organizations: [{ id: 'team-1', name: '测试服务队', type: 'team' }],
  positions: [{ id: 'position-1', organizationId: 'team-1', name: '秘书' }],
  users: [{ id: 'user-1', name: '测试成员', memberCode: 'T001' }],
  assignments: [{ id: 'assignment-1', organizationId: 'team-1', positionId: 'position-1', userId: 'user-1', startDate: '2026-01-01', endDate: '2099-12-31' }],
  grants: [{ id: 'grant-1', organizationId: 'team-1', userId: 'user-1', module: 'history', actions: ['create'], scopeType: 'position', scopeId: 'position-1', endDate: '2099-12-31' }]
})

assert.equal(graph.nodes.length, 4)
assert.equal(graph.edges.length, 3)
assert.ok(graph.nodes.some(item => item.id === 'grant:grant-1'))
const positionNode = graph.nodes.find(item => item.id === 'position:position-1')
assert.equal(positionNode.type, 'positionGrant')
assert.equal(positionNode.data.grantCount, 1)
assert.equal(buildGraph({ organizations: [], positions: [], users: [], assignments: [], grants: [] }).nodes.length, 0)
console.log('graph tests passed')

const portGraph = buildGraph({
  organizations: [{ id: 'team-1', name: '测试服务队', type: 'team' }], positions: [],
  users: [{ id: 'user-1', name: '测试成员', organizationId: 'team-1' }], assignments: [], grants: [],
  portPermissions: [{ id: 'port-1', teamId: 'team-1', userId: 'user-1', roleName: '档案管理员', dataScope: 'team', permissions: { archive: ['read', 'update'] }, endDate: '2099-12-31' }]
})
assert.ok(portGraph.nodes.some(item => item.id === 'port-group:team-1'))
assert.ok(portGraph.nodes.some(item => item.id === 'port-permission:port-1' && item.data.label.includes('档案目录：查看/修改')))

const expandedGraph = buildGraph({
  organizations: [{ id: 'team-1', name: '测试服务队', type: 'team' }], positions: [],
  users: [{ id: 'user-1', name: '测试成员', organizationId: 'team-1' }], assignments: [],
  grants: [{ id: 'all-1', organizationId: 'team-1', userId: 'user-1', module: 'all', actions: ['read'], scopeType: 'organization', endDate: '2099-12-31' }]
})
assert.equal(expandedGraph.nodes.filter(item => item.data.kind === 'grant-module').length, 15)
assert.ok(expandedGraph.nodes.some(item => item.id === 'grant:all-1:history' && item.data.label.includes('历史事件')))
