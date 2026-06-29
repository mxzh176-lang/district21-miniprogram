Component({
  properties: {
    group: {
      type: Object,
      value: {}
    },
    compact: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    handleOpen(event) {
      this.triggerEvent('open', event.detail)
    },

    handleComplete(event) {
      this.triggerEvent('complete', event.detail)
    }
  }
})
