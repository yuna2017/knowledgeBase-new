import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vitepress'

/**
 * 把正文里的 ```mermaid 代码块渲染成图。
 *
 * 为什么自己写、不装插件：mermaid 本来就是这个仓库的依赖，而 VitePress 会把
 * 代码块交给 shiki 逐行高亮。插件通常把 mermaid 全量注入首屏，这里改成按需
 * 动态 import —— 只有真正含图的页面（目前只有 vibecoding_v1_202605）才会去
 * 下载那个约 1 MB 的运行时，其余页面一个字节都不多。
 *
 * 图源直接从渲染后的代码块里读回来：VitePress 把每一行包进
 * `<span class="line">`，行与行之间是真实的换行文本节点，所以
 * `pre.textContent` 就是原始源码（已实测 8/8 个块与源文件逐字一致）。
 * 读到后存进 data 属性，切换深浅色时用它重画。
 *
 * 渲染失败一律保留原始代码块：读者看到源码，也好过看到一块空白。
 */

type MermaidTheme = 'default' | 'dark'

interface MermaidApi {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, code: string) => Promise<{ svg: string }>
}

/** data-mermaid-source：原始图源码；data-mermaid-theme：上次渲染用的主题 */
const SOURCE_KEY = 'mermaidSource'
const THEME_KEY = 'mermaidTheme'

/** mermaid.render 要求全局唯一的 id */
let renderSeq = 0

function currentTheme(): MermaidTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'default'
}

async function loadMermaid(): Promise<MermaidApi> {
  const mod = await import('mermaid')
  return (mod.default ?? mod) as MermaidApi
}

async function renderMermaidBlocks(): Promise<void> {
  // 服务端渲染阶段没有 DOM，这个函数只在 onMounted / watch 里被调用
  if (typeof document === 'undefined') return

  const blocks = Array.from(
    document.querySelectorAll<HTMLElement>('div.language-mermaid')
  )

  // 先把源码收好：渲染会覆盖掉代码块，之后换主题要拿它重画
  for (const block of blocks) {
    if (block.dataset[SOURCE_KEY]) continue
    const source = block.querySelector('pre')?.textContent
    if (source?.trim()) block.dataset[SOURCE_KEY] = source
  }

  const theme = currentTheme()
  const pending = blocks.filter(
    (block) => block.dataset[SOURCE_KEY] && block.dataset[THEME_KEY] !== theme
  )
  if (!pending.length) return

  let mermaid: MermaidApi
  try {
    mermaid = await loadMermaid()
  } catch (error) {
    console.warn('[mermaid] 运行时加载失败，保留源码：', error)
    return
  }

  mermaid.initialize({
    startOnLoad: false,
    // 默认的 strict 会编码标签里的 HTML，但 <br/> 换行仍然有效
    securityLevel: 'strict',
    theme,
    fontFamily: 'inherit'
  })

  for (const block of pending) {
    const source = block.dataset[SOURCE_KEY] as string
    // 先记下主题：渲染失败时也标记，避免每次滚动或切主题都重试同一个坏图
    block.dataset[THEME_KEY] = theme
    try {
      renderSeq += 1
      const { svg } = await mermaid.render('mermaid-diagram-' + renderSeq, source)
      block.innerHTML = svg
      block.classList.add('mermaid-rendered')
    } catch (error) {
      console.warn('[mermaid] 渲染失败，保留源码：', error)
    }
  }
}

/**
 * 在主题 Layout 里调用一次：跟着路由切换和深浅色切换重渲染。
 */
export function useMermaid(): void {
  const route = useRoute()
  let stopRoute: (() => void) | undefined
  let observer: MutationObserver | undefined

  onMounted(() => {
    // flush: 'post' + nextTick：确保读到的是新页面已经挂进 DOM 的正文
    stopRoute = watch(
      () => route.path,
      () => {
        void nextTick(() => renderMermaidBlocks())
      },
      { immediate: true, flush: 'post' }
    )

    // mermaid 的主题在 initialize 时定死，切换深浅色后要重画
    observer = new MutationObserver(() => {
      void renderMermaidBlocks()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
  })

  onBeforeUnmount(() => {
    stopRoute?.()
    observer?.disconnect()
  })
}
