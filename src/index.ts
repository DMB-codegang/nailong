import { Context, Schema, Logger, h } from 'koishi'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlink, writeFile } from 'node:fs/promises'
import { } from 'koishi-plugin-ffmpeg'
import { console } from 'node:inspector'

export const name = 'nailong'
export const description = '识别奶龙的插件'
export const author = '小舍'

const log = new Logger("@小舍/nailong")

export const inject = {
  required: ['http'],
  optional: ['ffmpeg']
}

export interface Config {
  api: string,
  threshold: number,
  message: Array<string>,
  dev: boolean
}
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    api: Schema.string().description('api请求接口').required().role('link'),
    threshold: Schema.number().description('识别阈值').role('slider')
      .min(75).max(100).step(0.1).default(85),
    message: Schema.array(Schema.string()).description('回复消息'),
  }).description('主要配置'),
  Schema.object({
    dev: Schema.boolean().default(false).description('调试模式（对所有图片识别并返回结果）')
  }).description('开发选项')
])
export function apply(ctx: Context, cfg: Config) {
  ctx.on('message', async (session) => {
    const [img2] = h.select(session.content, "img");
    console.log(img2)
    const imgUrl = img2?.attrs.src;
    let img;
    if (ctx.ffmpeg && (img2.attrs.file).includes('.gif')) {
      const gif = await ctx.http(imgUrl, { responseType: 'arraybuffer' })
      const frames = await getGifFrameCountWithoutLib(Buffer.from(gif.data))
      
      let i = 1;
      let maxscore: number = 0;
      while(i <= frames){
        const res = await gifToPng(ctx, gif.data, i)
        const img = res.data
        const res2 = await is_nailong(ctx, img, cfg)
        for (let i = 0; i < res2.data.length; i++) {
          if (res2.data[i].score * 100 > maxscore && res2.data[i].class_name == 'nailong') {
            maxscore = res2.data[i].score * 100
          }
        }
        if (maxscore > cfg.threshold) {
          session.send(cfg.message[getRandomInt(0, cfg.message.length - 1)])
          break
        }
        i=i+2
      }
      if (cfg.dev) {
        session.send(`gif共${frames}帧,跳帧后最高可能性为：${maxscore}`)
      }

    } else {
      img = await ctx.http(imgUrl, { responseType: 'arraybuffer' })
      const res = await is_nailong(ctx, img.data, cfg)
      let maxscore: number = 0;
      for (let i = 0; i < res.data.length; i++) {
        if (res.data[i].score * 100 > maxscore && res.data[i].class_name == 'nailong') {
          maxscore = res.data[i].score * 100
        }
      }
      if (maxscore > cfg.threshold) {
        session.send(cfg.message[getRandomInt(0, cfg.message.length - 1)])
      }
      if (cfg.dev) {
        let ans = `图像中包含${res.data.length}个识别对象`
        for (let i = 0; i < res.data.length; i++) {
          ans += `\n第${i + 1}个识别对象的的坐标为(${res.data[i].box[0]}, ${res.data[i].box[1]})\n是${res.data[i].class_name}的可能性为${(res.data[i].score * 100).toFixed(2)}%`
        }
        session.send(ans)
      }
    }

  })
}

function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function is_nailong(ctx: Context, img: Buffer, cfg: Config) {
  const apiUrl = `${cfg.api}`;
  const res = ctx.http.post(apiUrl, Buffer.from(img), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': img.byteLength.toString()
    }
  })
  return res
}

async function gifToPng(ctx: Context, gif: ArrayBuffer, num: number): Promise<{ data: Buffer }> {
  const path = join(tmpdir(), `gif-reverse-${Date.now()}`)
  await writeFile(path, Buffer.from(gif))
  const buf = await ctx.ffmpeg
    .builder()
    .input(path)
    .outputOption('-vf', `select=eq(n\\,${num})`, '-vframes', '1', '-f', 'image2')
    .run('buffer')
  await unlink(path);
  return { data: buf }
}

export function getGifFrameCountWithoutLib(buffer: Buffer) {
  let offset = 0;
  // 跳过GIF Header (6字节) + Logical Screen Descriptor (7字节)
  offset += 6 + 7;

  // LSD 的第10个bit (packed field最低位) 判断是否有全局调色板
  const gctFlag = (buffer[10] & 0x80) !== 0;
  if (gctFlag) {
    // GCT大小在LSD第10个字节高3位
    const gctSize = buffer[10] & 0x07;
    offset += 3 * (1 << (gctSize + 1));
  }

  let frames = 0;
  // 开始解析后续块
  while (offset < buffer.length) {
    const blockId = buffer[offset++];
    // 0x2C = Image Descriptor
    if (blockId === 0x2C) {
      frames++;
      // 跳过 ImageDescriptor(9 bytes) 
      offset += 8;
      // 若有本地调色板
      const localPacked = buffer[offset++];
      const lctFlag = (localPacked & 0x80) !== 0;
      if (lctFlag) {
        const lctSize = localPacked & 0x07;
        offset += 3 * (1 << (lctSize + 1));
      }
      // 跳过图像数据
      // LZW最小码
      offset++;
      // 数据子块直到 0x00 结束
      while (offset < buffer.length && buffer[offset] !== 0) {
        offset += buffer[offset] + 1;
      }
      offset++;
    } else if (blockId === 0x21) {
      // 扩展块，跳过
      offset++; // label
      while (offset < buffer.length && buffer[offset] !== 0) {
        offset += buffer[offset] + 1;
      }
      offset++;
    } else if (blockId === 0x3B) {
      // GIF终止符
      break;
    } else {
      // 其它情况，直接结束或跳过
      break;
    }
  }
  return frames;
}