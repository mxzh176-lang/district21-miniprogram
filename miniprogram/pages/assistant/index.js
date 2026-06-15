const assistant = require('../../utils/assistant')

const welcome = {
  id: 'welcome',
  role: 'assistant',
  content: '你好，我是二十一协作区 AI 助手。可以询问中国狮子联会知识、制度来源、公益活动记录方法和小程序使用问题。',
  sources: []
}

Page({
  data: {
    question: '',
    sending: false,
    scrollTo: 'message-welcome',
    messages: [welcome],
    suggestions: [
      '介绍一下中国狮子联会',
      '在哪里查看联会章程？',
      '公益活动应该记录哪些内容？',
      '怎样保护服务对象隐私？'
    ]
  },

  onLoad() {
    try {
      const saved = wx.getStorageSync('district21AssistantMessages')
      if (Array.isArray(saved) && saved.length) {
        this.setData({ messages: saved.slice(-20) })
      }
    } catch (error) {}
  },

  inputQuestion(event) {
    this.setData({ question: event.detail.value })
  },

  useSuggestion(event) {
    this.setData({ question: event.currentTarget.dataset.question })
    this.send()
  },

  async send() {
    const question = this.data.question.trim()
    if (!question || this.data.sending) return
    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      sources: []
    }
    const messages = this.data.messages.concat(userMessage)
    this.setData({
      question: '',
      sending: true,
      messages,
      scrollTo: `message-${userMessage.id}`
    })
    try {
      const result = await assistant.ask(question)
      const answerMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        sources: result.sources || [],
        mode: result.mode || 'knowledge'
      }
      const nextMessages = messages.concat(answerMessage).slice(-20)
      this.setData({
        messages: nextMessages,
        scrollTo: `message-${answerMessage.id}`
      })
      wx.setStorageSync('district21AssistantMessages', nextMessages)
    } catch (error) {
      wx.showToast({ title: '助手暂时无法回答', icon: 'none' })
    } finally {
      this.setData({ sending: false })
    }
  },

  copySource(event) {
    wx.setClipboardData({
      data: event.currentTarget.dataset.url,
      success: () => wx.showToast({ title: '来源链接已复制', icon: 'success' })
    })
  },

  clearChat() {
    wx.showModal({
      title: '清空对话',
      content: '确认清空本机保存的 AI 助手对话吗？',
      success: result => {
        if (!result.confirm) return
        wx.removeStorageSync('district21AssistantMessages')
        this.setData({ messages: [welcome], scrollTo: 'message-welcome' })
      }
    })
  }
})
