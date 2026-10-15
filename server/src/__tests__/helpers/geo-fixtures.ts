/** 实测的真实数据：手机上报的 WGS-84 与高德返回的 GCJ-02，两个用例文件共用 */

export const WGS = { lat: 31.862827483, lon: 117.16209704 }

/** 2026-10-15 真实响应（只留地址与 3 个 POI，值未改动） */
export const REAL_REGEO = {
  status: '1',
  info: 'OK',
  infocode: '10000',
  regeocode: {
    formatted_address: '安徽省合肥市蜀山区蜀山新产业园区博威香山丽舍(东门)',
    addressComponent: {
      city: '合肥市',
      province: '安徽省',
      adcode: '340104',
      district: '蜀山区',
      township: '蜀山新产业园区',
      citycode: '0551',
      country: '中国'
    },
    pois: [
      { name: '博威香山丽舍', distance: '104.046', type: '商务住宅;住宅区;住宅小区' },
      { name: '中国民生银行(合肥蜀峰路社区支行)', distance: '99.441', type: '金融保险服务;银行' },
      { name: '四季花海公园B区', distance: '276.916', type: '风景名胜;公园广场' }
    ]
  }
}

/** 与生产代码同一个解析器；这里只做类型放宽，便于把 plain object 当响应喂进去 */
export { parseAmapRegeo } from '../../services/phone/geocode.service.js'
