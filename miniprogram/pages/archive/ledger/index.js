const api = require('../../../utils/api')
const permission = require('../../../utils/permission')

Page({
  data: {
    organizationId: '',
    organization: {},
    records: [],
    canEdit: false,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    showForm: false,
    typeOptions: [
      { value: 'income', label: '收入' },
      { value: 'expense', label: '支出' },
      { value: 'asset', label: '资产' },
      { value: 'other', label: '其他' }
    ],
    typeIndex: 0,
    form: { id: '', title: '', amount: '', description: '', date: '' }
  },

  onLoad(options) {
    this.setData({ organizationId: options.organization || 'yuanhang' })
  },

  async onShow() {
    const [organizations, records, session] = await Promise.all([
      api.call('listArchives'),
      api.call('listLedgerRecords', { organizationId: this.data.organizationId }),
      api.call('getSession')
    ])
    const organization = organizations.find(item => item.id === this.data.organizationId) || organizations[0]
    this.setData({
      organization,
      records,
      canEdit: permission.canMaintainLedger(session, { organizationId: organization.cloudId || organization.id }, 'update'),
      canCreate: permission.canMaintainLedger(session, { organizationId: organization.cloudId || organization.id }, 'create'),
      canUpdate: permission.canMaintainLedger(session, { organizationId: organization.cloudId || organization.id }, 'update'),
      canDelete: permission.canMaintainLedger(session, { organizationId: organization.cloudId || organization.id }, 'delete')
    })
    wx.setNavigationBarTitle({ title: `${organization.shortName} · 司库账目` })
  },

  openCreate() {
    this.setData({
      showForm: true,
      typeIndex: 0,
      form: { id: '', title: '', amount: '', description: '', date: new Date().toISOString().slice(0, 10) }
    })
  },

  editRecord(event) {
    const record = this.data.records.find(item => item.id === event.currentTarget.dataset.id)
    if (!record || !this.data.canUpdate) return
    const typeIndex = Math.max(0, this.data.typeOptions.findIndex(item => item.value === record.type))
    this.setData({ showForm: true, typeIndex, form: { ...record, amount: String(record.amount) } })
  },

  closeForm() {
    this.setData({ showForm: false })
  },

  onInput(event) {
    this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value })
  },

  onTypeChange(event) {
    this.setData({ typeIndex: Number(event.detail.value) })
  },

  onDateChange(event) {
    this.setData({ 'form.date': event.detail.value })
  },

  async saveRecord() {
    const form = this.data.form
    if (!form.title.trim() || !form.date) {
      wx.showToast({ title: '请填写标题和日期', icon: 'none' })
      return
    }
    try {
      await api.call('saveLedgerRecord', {
        record: {
          ...form,
          organizationId: this.data.organizationId,
          title: form.title.trim(),
          amount: Number(form.amount) || 0,
          type: this.data.typeOptions[this.data.typeIndex].value
        }
      })
      this.setData({ showForm: false })
      wx.showToast({ title: '账目已保存', icon: 'success' })
      await this.onShow()
    } catch (error) {
      api.showError(error)
    }
  },

  deleteRecord(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除账目',
      content: '确认删除这条账目记录吗？',
      confirmColor: '#d94f65',
      success: async result => {
        if (!result.confirm) return
        try {
          await api.call('deleteLedgerRecord', { id })
          await this.onShow()
        } catch (error) {
          api.showError(error)
        }
      }
    })
  }
})
