import { Context, Schema, Logger } from 'koishi'

export const name = 'nailong'
export const description = '识别奶龙的插件'
export const author = '小舍'

const log = new Logger("@小舍/nailong")

export const inject = {
  required: ['http'],
  optional: [],
}

export interface Config {
  api: string,
}
export const Config: Schema<Config> = Schema.object({
  api: Schema.string().description('api请求接口').required()
}).description('主要配置')

export function apply(ctx: Context) {
  ctx.on('message', async (session) => {
    log.info('收到消息', session)
  })
}
