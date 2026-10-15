/**
 * WGS-84 → GCJ-02（火星坐标）转换。
 *
 * 为什么必须有这一步：手机 GPS 给的是国际标准 WGS-84，而高德/腾讯用 GCJ-02。
 * 直接拿 WGS-84 去高德反查**不会报错**，只会悄悄偏掉——实测合肥这个点偏 **568 米**，
 * 结果"你家"被识别成 276 米外的一个公园。这种错误比报错危险得多。
 *
 * 算法是公开的近似式（国家测绘局没有公开精确公式），误差约 1 米级，用于"配个地名"足够。
 * 境外坐标不做偏移（GCJ-02 只在中国境内生效）。
 */

const A = 6378245.0
const EE = 0.00669342162296594323

/** 大致判断是否在中国境外（GCJ-02 偏移只在境内生效） */
export function outOfChina(lat: number, lon: number): boolean {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0
  ret += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0
  return ret
}

function transformLon(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0
  ret += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0
  return ret
}

/** WGS-84 → GCJ-02；境外原样返回。 */
export function wgs84ToGcj02(lat: number, lon: number): { lat: number; lon: number } {
  if (outOfChina(lat, lon)) return { lat, lon }
  let dLat = transformLat(lon - 105.0, lat - 35.0)
  let dLon = transformLon(lon - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI)
  dLon = (dLon * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI)
  return { lat: lat + dLat, lon: lon + dLon }
}

/**
 * GCJ-02 → WGS-84（反向转换）。
 *
 * 用途很具体：**人在高德地图上点/拖出来的坐标是 GCJ-02**，直接当 WGS-84 存进库，
 * 就会把"家"记到 500 米外的另一条街上——方向和"忘了正向转换"一样错，只是反过来。
 *
 * 用迭代逼近正向转换的逆：GCJ-02 变换本身没有解析逆，但这个式子在几轮内收敛到厘米级
 * （每轮把误差加回输入，重新正变换，看还差多少）。
 */
export function gcj02ToWgs84(lat: number, lon: number): { lat: number; lon: number } {
  if (outOfChina(lat, lon)) return { lat, lon }

  let wgsLat = lat
  let wgsLon = lon
  for (let i = 0; i < 8; i++) {
    const gcj = wgs84ToGcj02(wgsLat, wgsLon)
    const dLat = lat - gcj.lat
    const dLon = lon - gcj.lon
    if (Math.abs(dLat) < 1e-9 && Math.abs(dLon) < 1e-9) break
    wgsLat += dLat
    wgsLon += dLon
  }
  return { lat: wgsLat, lon: wgsLon }
}
