import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import UrlCodecToolView from '../src/views/tools/UrlCodecToolView.vue'

// Mock message
const mockMessage = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn()
}
vi.mock('naive-ui', async () => {
  const actual = await vi.importActual('naive-ui')
  return {
    ...actual,
    useMessage: () => mockMessage
  }
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', redirect: '/toolbox' },
    { path: '/toolbox', component: { template: '<div>Toolbox</div>' } },
    { path: '/toolbox/url-codec', component: UrlCodecToolView }
  ]
})

describe.skip('UrlCodecToolView Integration', () => {
  beforeEach(async () => {
    router.push('/toolbox/url-codec')
    await router.isReady()
    mockMessage.success.mockClear()
    mockMessage.error.mockClear()
    mockMessage.warning.mockClear()
    localStorage.clear()
  })

  it('renders the component with correct title', async () => {
    const wrapper = mount(UrlCodecToolView, {
      global: {
        plugins: [router],
        stubs: {
          ToolLayout: {
            template: '<div><slot /></div>',
            props: ['title', 'status']
          }
        }
      }
    })

    expect(wrapper.text()).toContain('URL')
  })

  it('shows encode/decode/parse mode buttons', async () => {
    const wrapper = mount(UrlCodecToolView, {
      global: {
        plugins: [router],
        stubs: {
          ToolLayout: {
            template: '<div><slot /></div>',
            props: ['title', 'status']
          }
        }
      }
    })

    expect(wrapper.text()).toContain('编码')
    expect(wrapper.text()).toContain('解码')
    expect(wrapper.text()).toContain('URL解析')
  })

  it('encodes "hello world" to "hello%20world"', async () => {
    const wrapper = mount(UrlCodecToolView, {
      global: {
        plugins: [router],
        stubs: {
          ToolLayout: {
            template: '<div><slot /></div>',
            props: ['title', 'status']
          }
        }
      }
    })

    const textarea = wrapper.find('textarea')
    await textarea.setValue('hello world')

    const encodeButton = wrapper.findAll('button').find(b => b.text() === '编码')
    await encodeButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))
    expect(wrapper.text()).toContain('hello%20world')
  })

  it('decodes "hello%20world" to "hello world"', async () => {
    const wrapper = mount(UrlCodecToolView, {
      global: {
        plugins: [router],
        stubs: {
          ToolLayout: {
            template: '<div><slot /></div>',
            props: ['title', 'status']
          }
        }
      }
    })

    // Switch to decode mode
    const decodeButton = wrapper.findAll('button').find(b => b.text() === '解码')
    await decodeButton?.trigger('click')

    const textarea = wrapper.find('textarea')
    await textarea.setValue('hello%20world')

    const decodeBtn = wrapper.findAll('button').find(b => b.text() === '解码')
    await decodeBtn?.trigger('click')

    await new Promise(r => setTimeout(r, 100))
    expect(wrapper.text()).toContain('hello world')
  })

  it('switches between encode/decode/parse modes', async () => {
    const wrapper = mount(UrlCodecToolView, {
      global: {
        plugins: [router],
        stubs: {
          ToolLayout: {
            template: '<div><slot /></div>',
            props: ['title', 'status']
          }
        }
      }
    })

    // Switch to decode mode
    const decodeButton = wrapper.findAll('button').find(b => b.text() === '解码')
    await decodeButton?.trigger('click')
    await new Promise(r => setTimeout(r, 50))
    expect(wrapper.text()).toContain('编码输入')

    // Switch to parse mode
    const parseButton = wrapper.findAll('button').find(b => b.text() === 'URL解析')
    await parseButton?.trigger('click')
    await new Promise(r => setTimeout(r, 50))
    expect(wrapper.text()).toContain('URL 输入')

    // Switch back to encode mode
    const encodeButton = wrapper.findAll('button').find(b => b.text() === '编码')
    await encodeButton?.trigger('click')
    await new Promise(r => setTimeout(r, 50))
    expect(wrapper.text()).toContain('原文输入')
  })

  it('parses URL correctly into protocol/host/path/params', async () => {
    const wrapper = mount(UrlCodecToolView, {
      global: {
        plugins: [router],
        stubs: {
          ToolLayout: {
            template: '<div><slot /></div>',
            props: ['title', 'status']
          }
        }
      }
    })

    // Switch to parse mode
    const parseButton = wrapper.findAll('button').find(b => b.text() === 'URL解析')
    await parseButton?.trigger('click')

    const textarea = wrapper.find('textarea')
    await textarea.setValue('https://example.com/path?foo=bar&baz=qux')

    const confirmButton = wrapper.findAll('button').find(b => b.text() === '解析')
    await confirmButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))
    expect(wrapper.text()).toContain('example.com')
    expect(wrapper.text()).toContain('protocol')
    expect(wrapper.text()).toContain('host')
  })

  it('shows warning for empty input', async () => {
    const wrapper = mount(UrlCodecToolView, {
      global: {
        plugins: [router],
        stubs: {
          ToolLayout: {
            template: '<div><slot /></div>',
            props: ['title', 'status']
          }
        }
      }
    })

    // Try encoding with empty input
    const encodeButton = wrapper.findAll('button').find(b => b.text() === '编码')
    await encodeButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))
    expect(mockMessage.error).toHaveBeenCalled()
  })

  it('writes to history after successful encoding', async () => {
    const wrapper = mount(UrlCodecToolView, {
      global: {
        plugins: [router],
        stubs: {
          ToolLayout: {
            template: '<div><slot /></div>',
            props: ['title', 'status']
          }
        }
      }
    })

    const textarea = wrapper.find('textarea')
    await textarea.setValue('test')

    const encodeButton = wrapper.findAll('button').find(b => b.text() === '编码')
    await encodeButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))
    const stored = localStorage.getItem('oneplace_url_history')
    expect(stored).toBeTruthy()
    const history = JSON.parse(stored!)
    expect(history).toContain('test')
  })

  it('clears all input with clearAll button', async () => {
    const wrapper = mount(UrlCodecToolView, {
      global: {
        plugins: [router],
        stubs: {
          ToolLayout: {
            template: '<div><slot /></div>',
            props: ['title', 'status']
          }
        }
      }
    })

    const textarea = wrapper.find('textarea')
    await textarea.setValue('hello world')

    const clearButton = wrapper.findAll('button').find(b => b.text() === '清空')
    await clearButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))
    const inputValue = textarea.element.value
    expect(inputValue).toBe('')
  })

  it('shows Component/Standard mode toggle', async () => {
    const wrapper = mount(UrlCodecToolView, {
      global: {
        plugins: [router],
        stubs: {
          ToolLayout: {
            template: '<div><slot /></div>',
            props: ['title', 'status']
          }
        }
      }
    })

    expect(wrapper.text()).toContain('Component')
    expect(wrapper.text()).toContain('Standard')
  })

  it('has copy and clear buttons', async () => {
    const wrapper = mount(UrlCodecToolView, {
      global: {
        plugins: [router],
        stubs: {
          ToolLayout: {
            template: '<div><slot /></div>',
            props: ['title', 'status']
          }
        }
      }
    })

    expect(wrapper.text()).toContain('复制')
    expect(wrapper.text()).toContain('清空')
  })
})
