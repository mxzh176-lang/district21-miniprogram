Component({
  properties: {
    task: {
      type: Object,
      value: {}
    },
    compact: {
      type: Boolean,
      value: false
    },
    readonly: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    handleOpen() {
      const task = this.data.task || {}
      this.triggerEvent('open', { id: task._id || task.id, task })
    },

    handleComplete() {
      const task = this.data.task || {}
      if (this.data.readonly || task.completed) return
      this.triggerEvent('complete', { id: task._id || task.id, task })
    }
  }
})
