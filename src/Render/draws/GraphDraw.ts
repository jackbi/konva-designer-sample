import Konva from 'konva'
//
import * as Types from '../types'
import * as Graphs from '../graphs'
import * as Draws from '../draws'

export interface GraphDrawState {
  /**
   * 调整中
   */
  adjusting: boolean

  /**
   * 调整中 id
   */
  adjustGroupId: string

  /**
   * 调整中 类型
   */
  adjustType: string
}

export interface GraphDrawOption {
  //
}

export class GraphDraw extends Types.BaseDraw implements Types.Draw {
  static override readonly name = 'Graph'

  option: {}

  on = {}

  state: GraphDrawState = {
    adjusting: false,
    adjustType: '',
    adjustGroupId: ''
  }

  /**
   * 鼠标按下 调整点 位置
   */
  startPoint: Konva.Vector2d = { x: 0, y: 0 }

  /**
   * 图形 group 镜像
   */
  graphSnap: Konva.Group | undefined

  constructor(render: Types.Render, layer: Konva.Layer, option: GraphDrawOption) {
    super(render, layer)

    this.option = option

    this.group.name(this.constructor.name)
  }

  /**
   * 获取鼠标位置，并处理为 相对大小
   * @param attract 含磁贴计算
   * @returns
   */
  getStagePoint(attract = false) {
    const pos = this.render.stage.getPointerPosition()
    if (pos) {
      const stageState = this.render.getStageState()
      if (attract) {
        // 磁贴
        const { pos: transformerPos } = this.render.attractTool.attractPoint(pos)
        return {
          x: this.render.toStageValue(transformerPos.x - stageState.x),
          y: this.render.toStageValue(transformerPos.y - stageState.y)
        }
      } else {
        return {
          x: this.render.toStageValue(pos.x - stageState.x),
          y: this.render.toStageValue(pos.y - stageState.y)
        }
      }
    }
    return null
  }

  // 调整 预处理、定位静态方法
  adjusts(
    shapeDetailList: {
      graph: Konva.Group
      shapeRecords: { shape: Konva.Shape; anchorShadow: Konva.Circle }[]
    }[]
  ) {
    for (const { shapeRecords, graph } of shapeDetailList) {
      for (const { shape } of shapeRecords) {
        shape.setAttr('adjusting', false)
      }
      for (const shapeRecord of shapeRecords) {
        const { shape } = shapeRecord
        // 鼠标按下
        shape.on('mousedown', () => {
          this.state.adjusting = true
          this.state.adjustType = shape.attrs.anchor?.adjustType
          this.state.adjustGroupId = graph.id()

          shape.setAttr('adjusting', true)

          const pos = this.getStagePoint()
          if (pos) {
            this.startPoint = pos

            // 图形 group 镜像，用于计算位置、大小的偏移
            this.graphSnap = graph.clone()
          }
        })

        // 调整中
        this.render.stage.on('mousemove', () => {
          if (this.state.adjusting && this.graphSnap) {
            if (shape.attrs.adjusting) {
              // 调整 圆/椭圆 图形
              const pos = this.getStagePoint(true)
              if (pos) {
                if (shape.attrs.anchor?.type === Types.GraphType.Circle) {
                  // 使用 圆/椭圆 静态处理方法
                  Graphs.Circle.adjust(
                    this.render,
                    graph,
                    this.graphSnap,
                    shapeRecord,
                    shapeRecords,
                    this.startPoint,
                    pos
                  )
                } else if (shape.attrs.anchor?.type === Types.GraphType.Rect) {
                  // 使用 圆/椭圆 静态处理方法
                  Graphs.Rect.adjust(
                    this.render,
                    graph,
                    this.graphSnap,
                    shapeRecord,
                    shapeRecords,
                    this.startPoint,
                    pos
                  )
                } else if (shape.attrs.anchor?.type === Types.GraphType.Line) {
                  // 使用 直线、折线 静态处理方法
                  Graphs.Line.adjust(
                    this.render,
                    graph,
                    this.graphSnap,
                    shapeRecord,
                    shapeRecords,
                    this.startPoint,
                    pos
                  )
                }

                // 重绘
                this.render.redraw([
                  Draws.GraphDraw.name,
                  Draws.LinkDraw.name,
                  Draws.PreviewDraw.name
                ])
              }
            }
          }
        })

        // 调整结束
        this.render.stage.on('mouseup', () => {
          if (shape.attrs.adjusting) {
            // 更新历史
            this.render.updateHistory()

            // 重绘
            this.render.redraw([Draws.GraphDraw.name, Draws.LinkDraw.name, Draws.PreviewDraw.name])
          }
          this.state.adjusting = false
          this.state.adjustType = ''
          this.state.adjustGroupId = ''

          // 恢复显示所有 调整点
          for (const { shape } of shapeRecords) {
            shape.opacity(1)
            shape.setAttr('adjusting', false)
            if (shape.attrs.anchor?.type === Types.GraphType.Line) {
              shape.fill('rgba(0,0,255,0.2)')
            } else {
              shape.stroke('rgba(0,0,255,0.2)')
            }
            document.body.style.cursor = 'default'
          }

          // 销毁 镜像
          this.graphSnap?.destroy()

          // 对齐线清除
          this.render.attractTool.alignLinesClear()
        })

        this.group.add(shape)
      }
    }
  }

  override draw() {
    this.clear()

    // 所有图形
    const graphs = this.render.layer
      .find('.asset')
      .filter((o) => o.attrs.assetType === Types.AssetType.Graph) as Konva.Group[]

    const shapeDetailList: {
      graph: Konva.Group
      shapeRecords: { shape: Konva.Shape; anchorShadow: Konva.Circle }[]
    }[] = []

    for (const graph of graphs) {
      // 非选中状态才显示 调整点
      if (!graph.attrs.selected) {
        const anchors = (graph.attrs.anchors ?? []) as Types.GraphAnchor[]
        const shapeRecords: { shape: Konva.Shape; anchorShadow: Konva.Circle }[] = []

        // 根据 调整点 信息，创建
        for (const anchor of anchors) {
          // 调整点 的显示 依赖其隐藏的 锚点 位置、大小等信息
          const anchorShadow = graph
            .find(`.anchor`)
            .find((o) => o.attrs.adjustType === anchor.adjustType) as Konva.Circle
          if (anchorShadow) {
            switch (anchorShadow.attrs.anchorType) {
              case Types.GraphType.Circle:
                {
                  const shape = Graphs.Circle.createAnchorShape(
                    this.render,
                    graph,
                    anchor,
                    anchorShadow,
                    this.state.adjustType,
                    this.state.adjustGroupId
                  )

                  if (shape) {
                    shapeRecords.push({ shape, anchorShadow })
                  }
                }
                break
              case Types.GraphType.Rect:
                {
                  const shape = Graphs.Rect.createAnchorShape(
                    this.render,
                    graph,
                    anchor,
                    anchorShadow,
                    this.state.adjustType,
                    this.state.adjustGroupId
                  )

                  if (shape) {
                    shapeRecords.push({ shape, anchorShadow })
                  }
                }
                break
              case Types.GraphType.Line:
                {
                  const shape = Graphs.Line.createAnchorShape(
                    this.render,
                    graph,
                    anchor,
                    anchorShadow,
                    this.state.adjustType,
                    this.state.adjustGroupId
                  )

                  if (shape) {
                    shapeRecords.push({ shape, anchorShadow })
                  }
                }
                break
            }
          }
        }

        shapeDetailList.push({
          graph,
          shapeRecords
        })
      }
    }

    this.adjusts(shapeDetailList)
  }
}
