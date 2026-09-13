/**
 * useExecutionGraph —— D3 力导向执行流图封装
 *
 * 踩过的坑（已内置处理，勿简化）：
 *  1. 隐藏 Tab 中容器 clientWidth/Height 为 0 → 必须在容器可见后再 render()；
 *  2. 重绘前要 stop() 上一次 simulation、解绑 .zoom 监听、清空 SVG，否则监听与模拟叠加；
 *  3. 喂给 forceSimulation 的节点必须深拷贝，D3 会写入 x/y/fx/fy 污染源数据；
 *  4. 节点拖拽松手须把 fx/fy 置 null，否则节点被永久钉死。
 *
 * 用法：
 *  ```js
 *  const { svgRef, setGraphData, render, relayout, resetZoom } = useExecutionGraph({ colors })
 *  // 模板：<svg ref="svgRef" class="graph-svg" />
 *  ```
 */
import { ref, onBeforeUnmount } from 'vue'
import * as d3 from 'd3'
import { GRAPH_INK } from '@/theme'

const ARROW_KINDS = ['start', 'llm', 'tool', 'end', 'error']

/*
 * 连线与节点文字色取自 GRAPH_INK（其值由 theme.js 从 CSS 变量读出）。
 * 为什么不用 var(--border) 字符串省事：这里是通过 D3 的 .attr() 写 SVG **属性**，
 * SVG 表现属性不解析 CSS 变量；只有 .style() 才行。读具体色值最稳。
 * 因此这两个值必须在 setThemeMode() 之后取——见 theme.js 的 refreshPalette()。
 */
const linkColor = () => GRAPH_INK.link
const nodeTextColor = () => GRAPH_INK.nodeText

export function useExecutionGraph({ colors = {}, defaultSize = [640, 380] } = {}) {
  const svgRef = ref(null)
  /** 当前图数据 { nodes, links } */
  const graphData = ref(null)

  let simulation = null
  let zoom = null

  const colorOf = (kind) => colors[kind] || colors.start || GRAPH_INK.nodeText

  /** 设置数据；autoRender=true 时立即渲染（容器须已可见） */
  function setGraphData(data, autoRender = false) {
    graphData.value = data || null
    if (autoRender) render()
  }

  /** 箭头 marker：每种节点色一个 marker，供 link 按目标节点色引用 */
  function drawArrowDefs(svg) {
    const defs = svg.append('defs')
    ARROW_KINDS.forEach((kind) => {
      defs
        .append('marker')
        .attr('id', `arrow-${kind}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 26)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', colorOf(kind))
    })
  }

  /** 拖拽：拖时钉住，松手回归自由布局 */
  function attachDrag(nodeSel, sim) {
    return d3
      .drag()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0)
        d.fx = null
        d.fy = null
      })
  }

  /** 绘制节点：圆角矩形 + 文字 */
  function drawNodes(root, nodes, sim) {
    const nodeSel = root
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'graph-node')
      .style('cursor', 'grab')
      .call(attachDrag(null, sim))

    const nodeWidth = (d) => Math.max(96, d.label.length * 8 + 28)

    nodeSel
      .append('rect')
      .attr('width', nodeWidth)
      .attr('height', 32)
      .attr('x', (d) => -nodeWidth(d) / 2)
      .attr('y', -16)
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('fill', (d) => colorOf(d.kind))
      .attr('fill-opacity', 0.16)
      .attr('stroke', (d) => colorOf(d.kind))
      .attr('stroke-width', 1.4)

    nodeSel
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', nodeTextColor())
      .attr('font-size', 12)
      .text((d) => d.label)

    return nodeSel
  }

  /** 绘制连线 */
  function drawLinks(root, links, nodeById) {
    return root
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', linkColor())
      .attr('stroke-width', 1.4)
      .attr('marker-end', (d) => `url(#arrow-${nodeById.get(d.target)?.kind || 'start'})`)
  }

  /** 渲染（或重绘）力导向图 */
  function render() {
    const svgEl = svgRef.value
    const data = graphData.value
    if (!svgEl || !data) return

    const width = svgEl.clientWidth || defaultSize[0]
    const height = svgEl.clientHeight || defaultSize[1]

    teardown()
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    const root = svg.append('g')
    drawArrowDefs(svg)

    // 深拷贝：simulation 会写入 x/y/fx/fy，不能污染源 mock 数据
    const nodes = data.nodes.map((n) => ({ ...n }))
    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    const links = data.links.map(([s, t]) => ({ source: s, target: t }))

    const linkSel = drawLinks(root, links, nodeById)

    simulation = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(120).strength(0.9))
      .force('charge', d3.forceManyBody().strength(-420))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(72))

    const nodeSel = drawNodes(root, nodes, simulation)

    simulation.on('tick', () => {
      linkSel
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y)
      nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    // 画布缩放 & 平移
    zoom = d3.zoom().scaleExtent([0.3, 3]).on('zoom', (event) => root.attr('transform', event.transform))
    svg.call(zoom)
  }

  /** 重置视图（缩放回 1、平移到原点） */
  function resetZoom() {
    const svgEl = svgRef.value
    if (!svgEl || !zoom) return
    d3.select(svgEl).transition().duration(300).call(zoom.transform, d3.zoomIdentity)
  }

  /** 重新布局：清掉钉住坐标与残留速度，并复位视图 */
  function relayout() {
    if (!simulation) {
      render()
      return
    }
    simulation.nodes().forEach((n) => {
      n.fx = null
      n.fy = null
      n.vx = 0
      n.vy = 0
    })
    resetZoom()
    simulation.alpha(1).restart()
  }

  /** 打断上一次模拟与缩放监听，避免切 Tab 时叠加多份 */
  function teardown() {
    if (simulation) {
      simulation.stop()
      simulation = null
    }
    const svgEl = svgRef.value
    if (svgEl) {
      d3.select(svgEl).on('.zoom', null)
      svgEl.replaceChildren()
    }
    zoom = null
  }

  onBeforeUnmount(teardown)

  return { svgRef, graphData, setGraphData, render, relayout, resetZoom, teardown }
}
