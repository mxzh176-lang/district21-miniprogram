const api = require('../../utils/api')

Page({
  data: {
    terms: [],
    termIndex: 0,
    current: {}
  },

  async onLoad() {
    const terms = await api.call('listStructure')
    this.setData({ terms, current: terms[0] || {} })
  },

  changeTerm(event) {
    const termIndex = Number(event.detail.value)
    this.setData({ termIndex, current: this.data.terms[termIndex] })
  }
})
