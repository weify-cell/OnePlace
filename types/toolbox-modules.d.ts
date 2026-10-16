/**
 * 工具箱用到的几个哈希库没有自带类型声明（社区也没有 @types），这里按实际用法最小声明。
 * 只写用到的方法，不假装完整覆盖这些库。
 */

declare module 'md5' {
  /** 字符串或字节数组都收 */
  export default function md5(input: string | number[]): string
}

declare module 'sha.js' {
  interface ShaHash {
    update(data: string | number[], encoding?: string): ShaHash
    digest(encoding: 'hex'): string
  }
  export default function sha(algorithm: 'sha1' | 'sha256' | 'sha512'): ShaHash
}

declare module 'sm3' {
  export default function sm3(input: string | number[]): string
}
