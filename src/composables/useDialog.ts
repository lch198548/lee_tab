// 应用内对话框(Promise 化):替换原生 prompt/confirm,统一瓷白视觉
// 用法:
//   const { confirm: dialogConfirm, input: dialogInput } = useDialog()
//   const ok = await dialogConfirm({ title: '删除', message: '确定?', danger: true })
//   const name = await dialogInput({ title: '新建清单', placeholder: '名称' })

import { reactive } from 'vue'

export interface DialogOptions {
  title: string
  /** confirm 模式的说明文字 */
  message?: string
  /** input 模式的占位符 */
  placeholder?: string
  /** input 模式的初始值 */
  defaultValue?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作(删除等):确认按钮红色 */
  danger?: boolean
}

interface DialogState {
  open: boolean
  mode: 'confirm' | 'input'
  title: string
  message: string
  placeholder: string
  value: string
  confirmText: string
  cancelText: string
  danger: boolean
  resolve: ((v: string | null) => void) | null
}

const state = reactive<DialogState>({
  open: false,
  mode: 'confirm',
  title: '',
  message: '',
  placeholder: '',
  value: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  resolve: null
})

export function useDialog() {
  function ask(opts: DialogOptions & { mode: 'confirm' | 'input' }): Promise<string | null> {
    // 若已有弹窗未关闭,先取消它,保证同时只有一个
    state.resolve?.(null)
    state.open = true
    state.mode = opts.mode
    state.title = opts.title
    state.message = opts.message || ''
    state.placeholder = opts.placeholder || ''
    state.value = opts.defaultValue || ''
    state.confirmText = opts.confirmText || '确定'
    state.cancelText = opts.cancelText || '取消'
    state.danger = !!opts.danger
    return new Promise((resolve) => {
      state.resolve = resolve
    })
  }

  /** 确认框,resolve true(确认) / false(取消) */
  function confirm(opts: DialogOptions): Promise<boolean> {
    return ask({ ...opts, mode: 'confirm' }).then((v) => v !== null)
  }

  /** 输入框,resolve 输入内容(trim 后)或 null(取消/空) */
  function input(opts: DialogOptions): Promise<string | null> {
    return ask({ ...opts, mode: 'input' }).then((v) => {
      const t = v?.trim()
      return t ? t : null
    })
  }

  /** 由 AppDialogHost 调用:结束对话框 */
  function finish(value: string | null) {
    if (!state.open) return
    state.open = false
    const r = state.resolve
    state.resolve = null
    r?.(value)
  }

  return { dialog: state, confirm, input, finish }
}
