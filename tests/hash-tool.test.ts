import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import HashToolView from '../src/views/tools/HashToolView.vue'

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
    { path: '/toolbox/hash', component: HashToolView }
  ]
})

describe.skip('HashToolView Integration', () => {
  beforeEach(async () => {
    router.push('/toolbox/hash')
    await router.isReady()
    mockMessage.success.mockClear()
    mockMessage.error.mockClear()
    mockMessage.warning.mockClear()
    localStorage.clear()
  })

  it('renders the component with correct title', async () => {
    const wrapper = mount(HashToolView, {
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

    expect(wrapper.text()).toContain('哈希计算')
  })

  it('shows three tab buttons', async () => {
    const wrapper = mount(HashToolView, {
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

    expect(wrapper.text()).toContain('MD5/SHA1')
    expect(wrapper.text()).toContain('SHA2')
    expect(wrapper.text()).toContain('SHA-3/SM3')
  })

  it('shows input mode toggle', async () => {
    const wrapper = mount(HashToolView, {
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

    expect(wrapper.text()).toContain('文本输入')
    expect(wrapper.text()).toContain('文件上传')
  })

  it('computes MD5 correctly', async () => {
    const wrapper = mount(HashToolView, {
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
    await textarea.setValue('hello')

    const computeButton = wrapper.findAll('button').find(b => b.text() === '计算哈希')
    await computeButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))
    expect(wrapper.text()).toContain('5d41402abc4b2a76b9719d911017c592')
  })

  it('computes SHA256 correctly', async () => {
    const wrapper = mount(HashToolView, {
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

    // Switch to SHA2 tab
    const sha2Button = wrapper.findAll('button').find(b => b.text() === 'SHA2')
    await sha2Button?.trigger('click')

    // Select SHA256 algorithm
    const sha256Button = wrapper.findAll('button').find(b => b.text() === 'SHA256')
    await sha256Button?.trigger('click')

    const textarea = wrapper.find('textarea')
    await textarea.setValue('hello')

    const computeButton = wrapper.findAll('button').find(b => b.text() === '计算哈希')
    await computeButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))
    expect(wrapper.text()).toContain('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('shows warning for empty input', async () => {
    const wrapper = mount(HashToolView, {
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

    // Try computing with empty input
    const computeButton = wrapper.findAll('button').find(b => b.text() === '计算哈希')
    await computeButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))
    expect(mockMessage.warning).toHaveBeenCalledWith('请输入文本内容')
  })

  it('clears all input', async () => {
    const wrapper = mount(HashToolView, {
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
    await textarea.setValue('hello')

    const clearButton = wrapper.findAll('button').find(b => b.text() === '清空')
    await clearButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))
    const inputValue = textarea.element.value
    expect(inputValue).toBe('')
  })

  it('shows verify section after computing', async () => {
    const wrapper = mount(HashToolView, {
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
    await textarea.setValue('hello')

    const computeButton = wrapper.findAll('button').find(b => b.text() === '计算哈希')
    await computeButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))
    expect(wrapper.text()).toContain('校验')
  })

  it('shows match tag when hashes match', async () => {
    const wrapper = mount(HashToolView, {
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
    await textarea.setValue('hello')

    const computeButton = wrapper.findAll('button').find(b => b.text() === '计算哈希')
    await computeButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))

    // Find verify input and enter correct hash
    const verifyInput = wrapper.findAll('input').find(i => i.attributes('placeholder') === '输入待校验的哈希值...')
    await verifyInput?.setValue('5d41402abc4b2a76b9719d911017c592')

    const verifyButton = wrapper.findAll('button').find(b => b.text() === '校验')
    await verifyButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))
    expect(wrapper.text()).toContain('匹配')
  })

  it('shows mismatch tag when hashes do not match', async () => {
    const wrapper = mount(HashToolView, {
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
    await textarea.setValue('hello')

    const computeButton = wrapper.findAll('button').find(b => b.text() === '计算哈希')
    await computeButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))

    // Find verify input and enter wrong hash
    const verifyInput = wrapper.findAll('input').find(i => i.attributes('placeholder') === '输入待校验的哈希值...')
    await verifyInput?.setValue('wronghash')

    const verifyButton = wrapper.findAll('button').find(b => b.text() === '校验')
    await verifyButton?.trigger('click')

    await new Promise(r => setTimeout(r, 100))
    expect(wrapper.text()).toContain('不匹配')
  })
})