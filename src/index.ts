import { Context, Schema, Logger, h } from 'koishi'

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
  threshold: number,
  message: string,
  dev: boolean
}
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    api: Schema.string().description('api请求接口').required().role('link'),
    threshold: Schema.number().description('识别阈值').role('slider')
      .min(75).max(100).step(0.1).default(85),
    message: Schema.string().default('你再发你那破奶龙我就开小米su7创思你').description('回复消息').role('textarea', { rows: [2, 4] }),
  }).description('主要配置'),
  Schema.object({
    dev: Schema.boolean().default(false).description('调试模式（对所有图片识别并返回结果）')
  }).description('开发选项')
])
export function apply(ctx: Context, cfg: Config) {
  ctx.on('message', async (session) => {
    const [img2] = h.select(session.content, "img");
    const imgUrl = img2?.attrs.src;
    const img = await ctx.http(imgUrl, { responseType: 'arraybuffer' })
    const apiUrl = `${cfg.api}`;
    const res = await ctx.http.post(apiUrl, Buffer.from(img.data), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': img.data.byteLength.toString()
      }
    })

    let maxscore: number=0;
    for (let i = 0; i < res.data.length; i++) {
      if (res.data[i].score*100 > maxscore) {
        maxscore = res.data[i].score*100
      }
    }
    if (maxscore > cfg.threshold) {
      session.send(`你再发你那破奶龙我就开小米su7创斯你`) 
    }
    if (cfg.dev) {
      let ans = `图像中包含${res.data.length}个识别对象`
      for (let i = 0; i < res.data.length; i++) {
        ans += `\n第${i + 1}个识别对象的的坐标为(${res.data[i].box[0]}, ${res.data[i].box[1]})\n是奶龙的可能性为${(res.data[i].score * 100).toFixed(2)}%`
      }
      session.send(ans)
    }

  })
}




